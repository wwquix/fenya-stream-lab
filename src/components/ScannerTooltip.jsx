function ScannerTooltip({ as: Element = 'div', type, id, label, className = '', children, style, htmlType, ...rest }) {
  return (
    <Element className={`scanner-target ${className}`} data-entity-type={type} data-entity-id={id} style={style} type={htmlType} {...rest}>
      {children}
      {label ? <span className="scanner-label">{label}</span> : null}
    </Element>
  )
}

export default ScannerTooltip
