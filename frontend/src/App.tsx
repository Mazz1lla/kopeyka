import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { useAuth } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { AuthPage } from './pages/AuthPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { DashboardPage } from './pages/DashboardPage'
import { ImportPage } from './pages/ImportPage'
import { RulesPage } from './pages/RulesPage'
import { TransactionsPage } from './pages/TransactionsPage'

function RequireAuth() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Layout />
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route element={<RequireAuth />}>
        <Route index element={<DashboardPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="rules" element={<RulesPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route
          path="*"
          element={
            <p>
              Страница не найдена. <Link to="/">На главную</Link>
            </p>
          }
        />
      </Route>
    </Routes>
  )
}
