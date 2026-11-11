import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<ApiError | null>(null)
  const [pending, setPending] = useState(false)
  const isLogin = mode === 'login'

  if (auth.isAuthenticated) return <Navigate to="/" replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      if (isLogin) await auth.login(username.trim(), password)
      else await auth.register(username.trim(), password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from ?? '/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'Ошибка, попробуйте ещё раз'))
    } finally {
      setPending(false)
    }
  }

  const commonError =
    error && !error.field('username') && !error.field('password') ? error.message : null

  return (
    <div className="auth">
      <h1>Копейка</h1>
      <form onSubmit={onSubmit} noValidate>
        <h2>{isLogin ? 'Вход' : 'Регистрация'}</h2>
        {commonError && <div className="error-box" style={{ margin: 0 }}>{commonError}</div>}
        <label className="field">
          <span>Логин</span>
          <input
            className="input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoFocus
            required
            aria-invalid={Boolean(error?.field('username'))}
          />
          {error?.field('username') && <span className="field-error">{error.field('username')}</span>}
        </label>
        <label className="field">
          <span>Пароль{isLogin ? '' : ' (от 8 символов)'}</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            required
            aria-invalid={Boolean(error?.field('password'))}
          />
          {error?.field('password') && <span className="field-error">{error.field('password')}</span>}
        </label>
        <button className="btn btn-primary" type="submit" disabled={pending || !username.trim() || !password}>
          {isLogin ? 'Войти' : 'Зарегистрироваться'}
        </button>
        <p className="small" style={{ margin: 0 }}>
          {isLogin ? <Link to="/register">Регистрация</Link> : <Link to="/login">У меня есть аккаунт</Link>}
        </p>
      </form>
    </div>
  )
}
