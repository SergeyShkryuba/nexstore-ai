'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { localizedPath } from '@/i18n/routing'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { authCallbackUrl, MIN_PASSWORD_LENGTH, UPDATE_PASSWORD_PATH } from '@/lib/auth-redirect'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const t = useTranslations('Auth')
  const locale = useLocale()
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  // The Sign In tab swaps to a "send me a reset link" form and back.
  const [resetMode, setResetMode] = useState(false)
  const [resetSentTo, setResetSentTo] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const backToSignIn = () => {
    setResetMode(false)
    setResetSentTo(null)
  }

  const handleClose = () => {
    backToSignIn()
    onClose()
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setIsLoading(false)

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success(t('signedIn'))
    handleClose()
    router.refresh()
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
        // Without this the confirmation link goes to the project's Site URL,
        // which defaults to localhost:3000.
        // Back to the home page in the language they signed up in.
        emailRedirectTo: authCallbackUrl(window.location.origin, localizedPath('/', locale)),
      },
    })

    setIsLoading(false)

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success(t('accountCreated'), {
      description: t('confirmEmail'),
    })
    handleClose()
  }

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authCallbackUrl(window.location.origin, localizedPath(UPDATE_PASSWORD_PATH, locale)),
    })

    setIsLoading(false)

    if (error) {
      // Rate limits and the like. An unknown address is not an error here, on
      // purpose: the form must not reveal who has an account.
      toast.error(error.message)
      return
    }
    setResetSentTo(email)
  }

  const emailField = (id: string) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{t('email')}</Label>
      <Input
        id={id}
        type="email"
        autoComplete="email"
        placeholder="m@example.com"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={isLoading}
      />
    </div>
  )

  const spinner = isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{resetMode ? t('resetTitle') : t('title')}</DialogTitle>
          <DialogDescription>
            {resetMode ? t('resetDescription') : t('description')}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">{t('signInTab')}</TabsTrigger>
            <TabsTrigger value="signup">{t('signUpTab')}</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            {resetMode && resetSentTo ? (
              <div className="space-y-4 py-4 text-sm" aria-live="polite">
                <p>
                  {t.rich('resetSent', { email: resetSentTo, strong: (chunks) => <strong>{chunks}</strong> })}
                </p>
                <Button variant="outline" className="w-full" onClick={backToSignIn}>
                  {t('backToSignIn')}
                </Button>
              </div>
            ) : resetMode ? (
              <form onSubmit={handleResetRequest} className="space-y-4 py-4">
                {emailField('reset-email')}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {spinner}
                  {t('sendResetLink')}
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={backToSignIn}>
                  {t('backToSignIn')}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleSignIn} className="space-y-4 py-4">
                {emailField('signin-email')}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="signin-password">{t('password')}</Label>
                    <button
                      type="button"
                      onClick={() => setResetMode(true)}
                      className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      {t('forgotPassword')}
                    </button>
                  </div>
                  <Input
                    id="signin-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {spinner}
                  {t('signIn')}
                </Button>
              </form>
            )}
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={handleSignUp} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name">{t('fullName')}</Label>
                <Input
                  id="signup-name"
                  autoComplete="name"
                  placeholder={t('namePlaceholder')}
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              {emailField('signup-email')}
              <div className="space-y-2">
                <Label htmlFor="signup-password">{t('password')}</Label>
                <Input
                  id="signup-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">{t('minLength', { count: MIN_PASSWORD_LENGTH })}</p>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {spinner}
                {t('createAccount')}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
