import { Component } from 'react'
import AppErrorState from './AppErrorState.jsx'
import { translations } from '../i18n/translations.js'

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) console.error('Frontend render failed:', error)
  }

  render() {
    if (this.state.hasError) {
      const t = translations.ru
      return (
        <main className="app-shell app-error-shell">
          <AppErrorState
            title={t.renderErrorTitle}
            message={t.renderErrorMessage}
            actionLabel={t.reloadPage}
            onAction={() => window.location.reload()}
          />
        </main>
      )
    }
    return this.props.children
  }
}
