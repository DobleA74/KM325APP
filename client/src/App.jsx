import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, hasRole, useAuth } from './lib/auth.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Perfil from './pages/Perfil.jsx'
import Usuarios from './pages/Usuarios.jsx'
import Arqueos from './pages/Arqueos.jsx'
import EmpleadosList from './pages/EmpleadosList.jsx'
import EmpleadoEdit from './pages/EmpleadoEdit.jsx'

function Protected({ roles, children }) {
  const { ready, user } = useAuth()
  if (!ready) return <div style={{ padding: 18 }} className="muted">Cargando…</div>
  if (!user) return <Navigate to="/login" replace />
  if (!hasRole(user, roles)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <Protected>
              <Layout />
            </Protected>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="perfil" element={<Perfil />} />
          <Route
            path="usuarios"
            element={
              <Protected roles={['ADMIN']}>
                <Usuarios />
              </Protected>
            }
          />
          {/* Pantallas migrables (placeholders) */}
          <Route path="empleados" element={<EmpleadosList />} />
          <Route path="empleados/nuevo" element={<EmpleadoEdit mode="create" />} />
          <Route path="empleados/:legajo" element={<EmpleadoEdit mode="edit" />} />
          <Route path="arqueos" element={<Arqueos/>} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
