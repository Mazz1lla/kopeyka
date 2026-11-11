import { useQuery } from '@tanstack/react-query'
import { Link, NavLink, Outlet } from 'react-router-dom'

import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'

const links = [
  { to: '/', label: 'Месяц', end: true },
  { to: '/transactions', label: 'Операции' },
  { to: '/import', label: 'Импорт' },
  { to: '/rules', label: 'Правила' },
  { to: '/categories', label: 'Категории' },
]

export function Layout() {
  const { logout } = useAuth()
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ username: string }>('/auth/me/'),
    staleTime: Infinity,
  })

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="brand">
            Копейка
          </Link>
          <nav className="nav">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end}>
                {link.label}
              </NavLink>
            ))}
          </nav>
          <span className="user">
            {me.data?.username}{' '}
            <button type="button" className="link-btn" onClick={logout}>
              выйти
            </button>
          </span>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </>
  )
}
