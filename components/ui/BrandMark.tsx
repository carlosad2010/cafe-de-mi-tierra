import Image from 'next/image'

/**
 * Emblema de la marca — recorta la torre del logo oficial, descartando
 * el texto del lockup (ilegible por debajo de ~80px).
 *
 * El recorte se calcula sobre la caja del emblema dentro de logo.png:
 * x 31.4%–66.7%, y 6.5%–62% del alto total.
 */
export function BrandMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  const imgHeight = Math.round(size * 1.62)
  const imgWidth  = Math.round(imgHeight * 0.885)

  return (
    <span
      className={className}
      style={{
        display: 'inline-block',
        position: 'relative',
        width: size,
        height: size,
        overflow: 'hidden',
        flexShrink: 0,
      }}>
      <Image
        src="/logo.png"
        alt=""
        width={imgWidth}
        height={imgHeight}
        priority
        style={{
          position: 'absolute',
          left: '50%',
          top: -size * 0.055,
          transform: 'translateX(-50%)',
          maxWidth: 'none',
          width: imgWidth,
          height: imgHeight,
        }}
      />
    </span>
  )
}
