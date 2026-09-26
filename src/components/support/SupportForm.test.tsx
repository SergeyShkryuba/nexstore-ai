import { render as rtlRender, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import { SupportForm } from './SupportForm'
import { MESSAGES } from '@/i18n/messages'
import type { Locale } from '@/i18n/routing'

function render(ui: React.ReactElement, locale: Locale = 'en') {
  return rtlRender(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      {ui}
    </NextIntlClientProvider>,
  )
}

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

async function fillAndSend(email: string, message: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Message'), message)
  await user.click(screen.getByRole('button', { name: 'Send' }))
}

describe('SupportForm', () => {
  it('sends the message from the contact page and confirms it', async () => {
    fetchMock.mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
    render(<SupportForm />)

    await fillAndSend('ana@example.com', 'Where is my parcel?')

    expect(await screen.findByRole('status')).toHaveTextContent('Your message has reached the team')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/support')
    expect(JSON.parse(init.body)).toEqual({
      locale: 'en',
      email: 'ana@example.com',
      message: 'Where is my parcel?',
      transcript: [],
    })
  })

  it('sends the chat summary and transcript when the assistant opened it', async () => {
    fetchMock.mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
    const transcript = [{ role: 'user' as const, content: 'My parcel is damaged' }]
    render(<SupportForm compact summary="Damaged parcel" transcript={() => transcript} />)

    await fillAndSend('ana@example.com', 'Please help')

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ summary: 'Damaged parcel', transcript })
  })

  it('shows the server’s reason when the request is refused', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"Введите корректный email."}', { status: 400 }))
    render(<SupportForm />, 'ru')

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'ana@example.com')
    await user.type(screen.getByLabelText('Сообщение'), 'Привет')
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Введите корректный email.')
  })
})
