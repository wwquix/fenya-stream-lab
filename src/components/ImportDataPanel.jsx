import { useRef, useState } from 'react'
import { Reveal } from './MotionPrimitives.jsx'

const emptyResult = {
  successCount: 0,
  rejectedCount: 0,
}

function ImportDataPanel({ t }) {
  const fileInputRef = useRef(null)
  const [format, setFormat] = useState('json')
  const [contents, setContents] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [state, setState] = useState('idle')
  const [result, setResult] = useState(emptyResult)
  const [errors, setErrors] = useState([])
  const [message, setMessage] = useState(t.importIdle)

  function resetResult() {
    setResult(emptyResult)
    setErrors([])
  }

  function handleFormatChange(nextFormat) {
    setFormat(nextFormat)
    setState(contents.trim() ? 'ready' : 'idle')
    setMessage(contents.trim() ? t.importReady : t.importIdle)
    resetResult()
  }

  function handleContentsChange(event) {
    const nextContents = event.target.value
    setContents(nextContents)
    setSourceName('')
    setState(nextContents.trim() ? 'ready' : 'idle')
    setMessage(nextContents.trim() ? t.importReady : t.importIdle)
    resetResult()
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const nextContents = await file.text()
      const nextFormat = file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json'
      setFormat(nextFormat)
      setContents(nextContents)
      setSourceName(file.name)
      setState('ready')
      setMessage(`${t.importFileReady}: ${file.name}`)
      resetResult()
    } catch {
      setState('error')
      setMessage(t.importFileReadError)
    }
  }

  async function handleImport() {
    if (!contents.trim() || state === 'importing') {
      return
    }

    setState('importing')
    setMessage(t.importInProgress)
    resetResult()

    try {
      let body = contents
      let contentType = 'text/csv'

      if (format === 'json') {
        const parsed = JSON.parse(contents)
        if (!Array.isArray(parsed)) {
          throw new Error(t.importJsonArrayError)
        }
        body = JSON.stringify(parsed)
        contentType = 'application/json'
      }

      const response = await fetch(`/api/import/${format}`, {
        method: 'POST',
        headers: {
          'content-type': contentType,
          ...(sourceName ? { 'x-file-name': sourceName } : {}),
        },
        body,
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.message || t.importRequestError)
      }

      let importErrors = []
      if (payload.rejectedCount > 0) {
        const errorsResponse = await fetch(`/api/import/${payload.jobId}/errors`)
        const errorsPayload = await errorsResponse.json()
        importErrors = errorsResponse.ok && Array.isArray(errorsPayload.errors) ? errorsPayload.errors : []
      }

      setResult(payload)
      setErrors(importErrors)
      setState(payload.rejectedCount > 0 ? 'complete-with-errors' : 'complete')
      setMessage(payload.rejectedCount > 0 ? t.importCompletedWithErrors : t.importCompleted)
    } catch (error) {
      setState('error')
      setMessage(error instanceof SyntaxError ? t.importInvalidJson : error.message || t.importRequestError)
    }
  }

  return (
    <Reveal as="section" className="section-panel import-data-panel" id="import-data" aria-labelledby="import-data-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t.importKicker}</p>
          <h2 id="import-data-title">{t.importTitle}</h2>
          <p className="section-note">{t.importNote}</p>
        </div>
        <span className="section-kicker">SQLite</span>
      </div>

      <div className="import-panel-grid">
        <div className="import-input-panel glass-panel">
          <div className="import-mode-tabs" role="tablist" aria-label={t.importFormatLabel}>
            {['json', 'csv'].map((item) => (
              <button
                className={format === item ? 'is-active' : ''}
                type="button"
                role="tab"
                aria-selected={format === item}
                onClick={() => handleFormatChange(item)}
                key={item}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="import-file-field">
            <span id="import-file-label">{t.importUploadLabel}</span>
            <input
              id="import-file"
              ref={fileInputRef}
              type="file"
              accept=".json,.csv,application/json,text/csv"
              aria-hidden="true"
              tabIndex="-1"
              onChange={handleFileChange}
            />
            <button className="liquid-button" type="button" onClick={() => fileInputRef.current?.click()}>
              {t.importChooseFile}
            </button>
            <small>{sourceName || t.importNoFile}</small>
          </div>

          <label className="import-paste-field" htmlFor="import-payload">
            <span>{t.importPasteLabel}</span>
            <textarea
              id="import-payload"
              value={contents}
              onChange={handleContentsChange}
              placeholder={format === 'json' ? t.importJsonPlaceholder : t.importCsvPlaceholder}
              spellCheck="false"
            />
          </label>

          <button
            className="liquid-button import-submit"
            type="button"
            disabled={!contents.trim() || state === 'importing'}
            onClick={handleImport}
          >
            {state === 'importing' ? t.importing : t.importAction}
          </button>
        </div>

        <aside className="import-result-panel glass-panel" aria-live="polite">
          <div className={`import-state is-${state}`}>
            <span>{t.importStateLabel}</span>
            <strong>{message}</strong>
          </div>

          <div className="import-counts">
            <article>
              <span>{t.importSuccessCount}</span>
              <strong>{result.successCount ?? 0}</strong>
            </article>
            <article>
              <span>{t.importRejectedCount}</span>
              <strong>{result.rejectedCount ?? 0}</strong>
            </article>
          </div>

          <div className="import-errors">
            <h3>{t.importErrorsTitle}</h3>
            {errors.length ? (
              <ul>
                {errors.slice(0, 8).map((error, index) => (
                  <li key={`${error.rowNumber}-${index}`}>
                    <strong>{t.importRow} {error.rowNumber}</strong>
                    <span>{error.message}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t.importNoErrors}</p>
            )}
          </div>
        </aside>
      </div>
    </Reveal>
  )
}

export default ImportDataPanel
