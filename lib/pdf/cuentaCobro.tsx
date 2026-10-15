import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { formatCOP, formatDateLarga, montoEnLetras } from '@/lib/utils'
import { CUENTA_PAGO } from '@/lib/utils'
import type { CuentaCobro } from '@/lib/types'

// Paleta consistente con el resto de los documentos del sistema (factura en
// pantalla / impresión de InvoicesClient.tsx), no la del formato Word
// original que se reemplaza.
const COLOR = {
  marron: '#8b5e3c',
  marronOscuro: '#6b4423',
  texto: '#2c1810',
  fondo: '#fdf8f3',
  borde: '#e8ccab',
}

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, color: COLOR.texto, fontFamily: 'Helvetica' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  logo: { width: 110 },
  fechaCiudad: { fontSize: 10, color: COLOR.marronOscuro },
  titulo: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: COLOR.marron, textAlign: 'center', marginBottom: 20, letterSpacing: 0.5 },
  clienteBloque: { textAlign: 'center', marginBottom: 18 },
  clienteNombre: { fontFamily: 'Helvetica-Bold', fontSize: 12, marginBottom: 2 },
  clienteLinea: { fontSize: 10, color: COLOR.marronOscuro, marginBottom: 2 },
  debeA: { fontSize: 9, color: COLOR.marronOscuro, marginTop: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  repNombre: { fontFamily: 'Helvetica-Bold', fontSize: 11 },
  repDoc: { fontSize: 10, color: COLOR.marronOscuro },
  suma: { fontSize: 11, marginTop: 20, marginBottom: 8 },
  objeto: { fontSize: 11, marginBottom: 20 },
  table: { borderWidth: 1, borderColor: COLOR.borde, borderRadius: 4, overflow: 'hidden' },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: COLOR.marron },
  tableRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLOR.borde },
  tableRowAlt: { backgroundColor: COLOR.fondo },
  totalRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLOR.borde, backgroundColor: COLOR.fondo },
  cellItem: { flex: 3, padding: 8, fontSize: 10 },
  cellCant: { flex: 1, padding: 8, fontSize: 10, textAlign: 'center' },
  cellValor: { flex: 1.3, padding: 8, fontSize: 10, textAlign: 'right' },
  cellSubtotal: { flex: 1.3, padding: 8, fontSize: 10, textAlign: 'right' },
  headerCell: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 9, textTransform: 'uppercase' },
  totalLabel: { flex: 5.3, padding: 8, fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  totalValor: { flex: 1.3, padding: 8, fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'right', color: COLOR.marron },
  pago: { marginTop: 24, padding: 14, backgroundColor: COLOR.fondo, borderWidth: 1, borderColor: COLOR.borde, borderRadius: 8, textAlign: 'center', fontSize: 9.5, color: COLOR.marronOscuro },
  firmaBloque: { marginTop: 48 },
  firmaImg: { width: 130, height: 50, objectFit: 'contain', marginBottom: 4 },
  firmaLinea: { borderTopWidth: 1, borderTopColor: '#999', width: 200, marginBottom: 4 },
})

function CuentaCobroDocument({ cc }: { cc: CuentaCobro }) {
  // Por URL absoluta, no por filesystem: en una función serverless (Vercel)
  // no hay garantía de que el file tracing empaquete public/logo.png cuando
  // solo lo lee @react-pdf/renderer en tiempo de ejecución, no un import
  // estático. Una URL es el mismo mecanismo que ya usa la firma.
  const logoUrl = `${process.env.NEXT_PUBLIC_APP_URL}/logo.png`
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <Text style={styles.fechaCiudad}>
            {cc.ciudad_emision}, {formatDateLarga(cc.fecha_emision)}
          </Text>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf/renderer (capa de PDF), no <img> HTML */}
          <Image src={logoUrl} style={styles.logo} />
        </View>

        <Text style={styles.titulo}>CUENTA DE COBRO N.° {String(cc.numero).padStart(3, '0')}</Text>

        <View style={styles.clienteBloque}>
          <Text style={styles.clienteNombre}>{cc.cliente_nombre}</Text>
          <Text style={styles.clienteLinea}>NIT {cc.cliente_nit}</Text>

          <Text style={styles.debeA}>Debe a</Text>
          <Text style={styles.repNombre}>{cc.representante_nombre}</Text>
          <Text style={styles.repDoc}>C.C. {cc.representante_documento}</Text>
        </View>

        <Text style={styles.suma}>La suma de: {montoEnLetras(cc.monto)} ({formatCOP(cc.monto)})</Text>
        <Text style={styles.objeto}>Objeto: {cc.objeto}</Text>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.cellItem, styles.headerCell]}>Ítem</Text>
            <Text style={[styles.cellCant, styles.headerCell]}>Cant.</Text>
            <Text style={[styles.cellValor, styles.headerCell]}>Valor unitario</Text>
            <Text style={[styles.cellSubtotal, styles.headerCell]}>Subtotal</Text>
          </View>
          {cc.items.map((item, i) => (
            <View key={i} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
              <Text style={styles.cellItem}>{item.product_name}</Text>
              <Text style={styles.cellCant}>{item.quantity}</Text>
              <Text style={styles.cellValor}>{formatCOP(item.unit_price)}</Text>
              <Text style={styles.cellSubtotal}>{formatCOP(item.subtotal)}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValor}>{formatCOP(cc.monto)}</Text>
          </View>
        </View>

        <Text style={styles.pago}>
          Si el pago es por transferencia, consignar en la Cuenta de {CUENTA_PAGO.tipo} No.{' '}
          {CUENTA_PAGO.numero} de {CUENTA_PAGO.banco}, de la cual soy titular.
        </Text>

        <View style={styles.firmaBloque}>
          {cc.representante_firma_url ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf/renderer, no <img> HTML
            <Image src={cc.representante_firma_url} style={styles.firmaImg} />
          ) : (
            <View style={styles.firmaLinea} />
          )}
          <Text style={styles.repNombre}>{cc.representante_nombre}</Text>
          <Text style={styles.repDoc}>C.C. {cc.representante_documento}</Text>
        </View>
      </Page>
    </Document>
  )
}

/** Genera el PDF de una cuenta de cobro ya congelada (persistida en la BD). */
export async function generarCuentaCobroPDF(cc: CuentaCobro): Promise<Buffer> {
  return renderToBuffer(<CuentaCobroDocument cc={cc} />)
}
