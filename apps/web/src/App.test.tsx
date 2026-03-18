import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('App Smoke Test', () => {
  it('renders Lokfi heading', () => {
    render(<App />)
    expect(screen.getByText(/Lokfi/i)).toBeInTheDocument()
  })
})
