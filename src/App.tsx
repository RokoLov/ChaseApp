import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useProfile } from './lib/profile'
import ComingSoon from './pages/ComingSoon'
import Home from './pages/Home'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import Welcome from './pages/Welcome'

/** Screens that need a profile send new players to Welcome first. */
function RequireProfile() {
  const profile = useProfile((s) => s.profile)
  return profile ? <Outlet /> : <Navigate to="/welcome" replace />
}

function WelcomeGate() {
  const profile = useProfile((s) => s.profile)
  return profile ? <Navigate to="/" replace /> : <Welcome />
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
          <Route path="/create" element={<ComingSoon title="Create game" milestone="milestones 2 and 3" />} />
          <Route path="/join" element={<ComingSoon title="Join game" milestone="milestone 2" />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
