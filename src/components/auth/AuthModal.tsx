'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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

    toast.success('Signed in')
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
        emailRedirectTo: authCallbackUrl(window.location.origin, '/'),
      },
    })

    setIsLoading(false)

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success('Account created', {
      description: 'Check your inbox to confirm your email address.',
    })
    handleClose()
  }

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authCallbackUrl(window.location.origin, UPDATE_PASSWORD_PATH),
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
      <Label htmlFor={id}>Email</Label>
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
          <DialogTitle>{resetMode ? 'Reset your password' : 'Authentication'}</DialogTitle>
          <DialogDescription>
            {resetMode
              ? 'We will email you a link to set a new password.'
              : 'Sign in to your account or create a new one to start shopping.'}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign In</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            {resetMode && resetSentTo ? (
              <div className="space-y-4 py-4 text-sm" aria-live="polite">
                <p>
                  If an account exists for <strong>{resetSentTo}</strong>, a reset link is on its way.
                  It works once, for an hour, in this browser.
                </p>
                <Button variant="outline" className="w-full" onClick={backToSignIn}>
                  Back to sign in
                </Button>
              </div>
            ) : resetMode ? (
              <form onSubmit={handleResetRequest} className="space-y-4 py-4">
                {emailField('reset-email')}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {spinner}
                  Send reset link
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={backToSignIn}>
                  Back to sign in
                </Button>
              </form>
            ) : (
              <form onSubmit={handleSignIn} className="space-y-4 py-4">
                {emailField('signin-email')}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="signin-password">Password</Label>
                    <button
                      type="button"
                      onClick={() => setResetMode(true)}
                      className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Forgot password?
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
                  Sign In
                </Button>
              </form>
            )}
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={handleSignUp} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name">Full Name</Label>
                <Input
                  id="signup-name"
                  autoComplete="name"
                  placeholder="John Doe"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              {emailField('signup-email')}
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
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
                <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</p>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {spinner}
                Create Account
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
