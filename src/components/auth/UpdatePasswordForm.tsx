'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/utils/supabase/client'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth-redirect'

/** Sets a new password for the signed-in user (reached from a reset email). */
export function UpdatePasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const mismatch = confirm.length > 0 && password !== confirm

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH || password !== confirm) return

    setIsSaving(true)
    const { error } = await createClient().auth.updateUser({ password })
    setIsSaving(false)

    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Password updated', { description: 'You are signed in with the new password.' })
    router.push('/profile')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isSaving}
        />
        <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Repeat it</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={mismatch || undefined}
          aria-describedby={mismatch ? 'password-mismatch' : undefined}
          disabled={isSaving}
        />
        {mismatch && (
          <p id="password-mismatch" className="text-xs text-destructive">
            The passwords do not match.
          </p>
        )}
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={isSaving || password.length < MIN_PASSWORD_LENGTH || password !== confirm}
      >
        {isSaving && <Loader2 className="animate-spin" aria-hidden="true" />}
        Save new password
      </Button>
    </form>
  )
}
