function ScannerTooltip({ as: Element = 'div', type, id, label, className = '', children, style, ...rest }) {
  return (
    <Element className={`scanner-target ${className}`} data-entity-type={type} data-entity-id={id} style={style} {...rest}>
      {children}
      {label ? <span className="scanner-label">{label}</span> : null}
    </Element>
  )
}

export default ScannerTooltip
