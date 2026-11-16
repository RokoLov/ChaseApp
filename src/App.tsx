import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { useProfile } from './lib/profile'
import Create from './pages/Create'
import Game from './pages/Game'
import Home from './pages/Home'
import Join from './pages/Join'
import Lobby from './pages/Lobby'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import Welcome from './pages/Welcome'

/** Screens that need a profile send new players to Welcome first, then bring them back. */
function RequireProfile() {
  const profile = useProfile((s) => s.profile)
  const location = useLocation()
  return profile ? <Outlet /> : <Navigate to="/welcome" replace state={{ from: location.pathname }} />
}

function WelcomeGate() {
  const profile = useProfile((s) => s.profile)
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  return profile ? <Navigate to={from} replace /> : <Welcome />
}

/** An invite link (/join/CODE) goes straight to that lobby. */
function InviteLink() {
  const { code = '' } = useParams()
  return <Navigate to={`/lobby/${code.toUpperCase()}`} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/welcome" element={<WelcomeGate />} />
        <Route element={<RequireProfile />}>
          <Route path="/" element={<Home />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/create" element={<Create />} />
          <Route path="/join" element={<Join />} />
          <Route path="/join/:code" element={<InviteLink />} />
          <Route path="/lobby/:code" element={<Lobby />} />
          <Route path="/game/:code" element={<Game />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
