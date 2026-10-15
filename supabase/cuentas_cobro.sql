-- ============================================================================
-- Cuentas de cobro (documento de cobro institucional, estilo "Roka")
--
-- OJO: esto NO es lo mismo que la tabla `cuentas_cobrar` (cartera/cuentas por
-- cobrar, ya existente). "Cuenta de cobro" es un documento de cobro puntual
-- que firma el representante legal para un cliente institucional (NIT),
-- numerado y correlativo. Nombres parecidos a propósito (así se llama el
-- documento en la vida real), pero son conceptos distintos — no confundir
-- en código ni al leer este archivo.
--
-- Todo lo que entra en el PDF se congela en el momento de emitirlo (mismo
-- principio que `order_items.comision_unitaria`): si después cambia el
-- representante legal, su firma, o el cliente edita su NIT, una cuenta de
-- cobro ya emitida no debe cambiar — es un documento legal numerado.
-- ============================================================================

-- ── 1. Datos del representante legal + ciudad, en Configuración ────────────
-- (editables desde Configuración › Negocio; con upload de firma)
alter table public.configuracion
  add column if not exists ciudad text,
  add column if not exists representante_legal_nombre text,
  add column if not exists representante_legal_documento text,
  add column if not exists representante_legal_firma_url text;

-- ── 2. Secuencia y tabla de cuentas de cobro ────────────────────────────────
-- Arranca en 6: la 001-005 ya se emitieron manualmente fuera del sistema.
CREATE SEQUENCE public.cuentas_cobro_numero_seq
    START WITH 6
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE public.cuentas_cobro (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    numero integer DEFAULT nextval('public.cuentas_cobro_numero_seq'::regclass) NOT NULL,
    order_id uuid NOT NULL REFERENCES public.orders(id),
    customer_id uuid NOT NULL REFERENCES public.customers(id),

    -- Snapshot del cliente al momento de emitir (congelado)
    cliente_nombre text NOT NULL,
    cliente_nit text NOT NULL,
    cliente_direccion text,
    cliente_ciudad text,

    -- Snapshot de lo que se cobra (congelado)
    objeto text NOT NULL,
    monto numeric(12,2) NOT NULL,
    items jsonb NOT NULL,

    -- Snapshot de quién firma y desde dónde se emite (congelado)
    ciudad_emision text NOT NULL,
    representante_nombre text NOT NULL,
    representante_documento text NOT NULL,
    representante_firma_url text,

    fecha_emision date DEFAULT CURRENT_DATE NOT NULL,
    created_by uuid REFERENCES public.profiles(id),
    email_sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,

    CONSTRAINT cuentas_cobro_pkey PRIMARY KEY (id),
    CONSTRAINT cuentas_cobro_numero_key UNIQUE (numero),
    -- Un pedido tiene a lo sumo una cuenta de cobro: si se reintenta, se
    -- reenvía la misma (mismo número), nunca se emite una nueva.
    CONSTRAINT cuentas_cobro_order_id_key UNIQUE (order_id)
);

COMMENT ON TABLE public.cuentas_cobro IS 'Documento de cobro institucional numerado, firmado por el representante legal. Distinto de cuentas_cobrar (cartera).';

ALTER TABLE public.cuentas_cobro ENABLE ROW LEVEL SECURITY;

CREATE POLICY lectura_autenticados ON public.cuentas_cobro FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY insercion_escritores ON public.cuentas_cobro FOR INSERT WITH CHECK (public.puede_escribir());
CREATE POLICY actualizacion_escritores ON public.cuentas_cobro FOR UPDATE USING (public.puede_escribir()) WITH CHECK (public.puede_escribir());
CREATE POLICY borrado_escritores ON public.cuentas_cobro FOR DELETE USING (public.puede_escribir());

GRANT ALL ON TABLE public.cuentas_cobro TO anon;
GRANT ALL ON TABLE public.cuentas_cobro TO authenticated;
GRANT ALL ON TABLE public.cuentas_cobro TO service_role;

GRANT ALL ON SEQUENCE public.cuentas_cobro_numero_seq TO anon;
GRANT ALL ON SEQUENCE public.cuentas_cobro_numero_seq TO authenticated;
GRANT ALL ON SEQUENCE public.cuentas_cobro_numero_seq TO service_role;

-- ── 3. Storage: bucket para la firma del representante legal ───────────────
-- Público de lectura (la firma se incrusta en PDFs servidos por la app,
-- y @react-pdf/renderer necesita poder leer la imagen por URL); escritura
-- restringida a quien puede escribir en el sistema.
insert into storage.buckets (id, name, public)
values ('negocio', 'negocio', true)
on conflict (id) do nothing;

CREATE POLICY negocio_lectura_publica ON storage.objects FOR SELECT
  USING (bucket_id = 'negocio');
CREATE POLICY negocio_insercion_escritores ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'negocio' AND public.puede_escribir());
CREATE POLICY negocio_actualizacion_escritores ON storage.objects FOR UPDATE
  USING (bucket_id = 'negocio' AND public.puede_escribir())
  WITH CHECK (bucket_id = 'negocio' AND public.puede_escribir());
CREATE POLICY negocio_borrado_escritores ON storage.objects FOR DELETE
  USING (bucket_id = 'negocio' AND public.puede_escribir());
