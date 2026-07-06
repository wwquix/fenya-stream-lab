import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/global.css'
import App from './App.jsx'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'
import AppErrorState from './components/AppErrorState.jsx'
import { isKnownFrontendPath } from './utils/dashboardUi.js'
import { translations } from './i18n/translations.js'

const fallbackText = translations.ru

const app = isKnownFrontendPath(window.location.pathname) ? (
  <AppErrorBoundary><App /></AppErrorBoundary>
) : (
  <main className="app-shell app-error-shell">
    <AppErrorState title={fallbackText.unknownRouteTitle} message={fallbackText.unknownRouteMessage} actionLabel={fallbackText.returnToDashboard} href="/" />
  </main>
)

createRoot(document.getElementById('root')).render(<StrictMode>{app}</StrictMode>)
