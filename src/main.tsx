import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { isSupported } from './lib/support'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App supported={isSupported()} />
  </StrictMode>,
)
