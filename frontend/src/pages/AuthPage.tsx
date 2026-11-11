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
    <div className="container">
      <div className="row justify-content-center mt-5">
        <div className="col-sm-8 col-md-5 col-lg-4">
          <h1 className="h3 text-center mb-4">Копейка</h1>
          <div className="card">
            <div className="card-body">
              <h5 className="card-title mb-3">{isLogin ? 'Вход' : 'Регистрация'}</h5>
              <form onSubmit={onSubmit} noValidate>
                {commonError && <div className="alert alert-danger">{commonError}</div>}
                <div className="mb-3">
                  <label className="form-label" htmlFor="username">
                    Логин
                  </label>
                  <input
                    id="username"
                    className={error?.field('username') ? 'form-control is-invalid' : 'form-control'}
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    autoFocus
                    required
                  />
                  <div className="invalid-feedback">{error?.field('username')}</div>
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="password">
                    Пароль{isLogin ? '' : ' (от 8 символов)'}
                  </label>
                  <input
                    id="password"
                    className={error?.field('password') ? 'form-control is-invalid' : 'form-control'}
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    required
                  />
                  <div className="invalid-feedback">{error?.field('password')}</div>
                </div>
                <button
                  className="btn btn-primary w-100"
                  type="submit"
                  disabled={pending || !username.trim() || !password}
                >
                  {isLogin ? 'Войти' : 'Зарегистрироваться'}
                </button>
              </form>
            </div>
          </div>
          <p className="text-center mt-3">
            {isLogin ? <Link to="/register">Регистрация</Link> : <Link to="/login">У меня есть аккаунт</Link>}
          </p>
        </div>
      </div>
    </div>
  )
}
