import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

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
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ username: string }>('/auth/me/'),
    staleTime: Infinity,
  })

  useEffect(() => setMenuOpen(false), [location.pathname])

  return (
    <>
      <nav className="navbar navbar-expand-md bg-primary mb-4" data-bs-theme="dark">
        <div className="container">
          <Link className="navbar-brand" to="/">
            Копейка
          </Link>
          <button
            className="navbar-toggler"
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Меню"
          >
            <span className="navbar-toggler-icon" />
          </button>
          <div className={menuOpen ? 'collapse navbar-collapse show' : 'collapse navbar-collapse'}>
            <ul className="navbar-nav me-auto">
              {links.map((link) => (
                <li className="nav-item" key={link.to}>
                  <NavLink className="nav-link" to={link.to} end={link.end}>
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
            <span className="navbar-text me-3">{me.data?.username}</span>
            <button type="button" className="btn btn-outline-light btn-sm" onClick={logout}>
              Выйти
            </button>
          </div>
        </div>
      </nav>
      <main className="container pb-5">
        <Outlet />
      </main>
    </>
  )
}
