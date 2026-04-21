import { createHashRouter } from 'react-router-dom'
import ActiveSessionScreen from '../features/active-session/ActiveSessionScreen'
import HomeScreen from '../features/home/HomeScreen'
import SessionDetailScreen from '../features/session-detail/SessionDetailScreen'
import SessionEndedScreen from '../features/active-session/SessionEndedScreen'
import SessionsScreen from '../features/sessions/SessionsScreen'
import { ROUTES } from './routes'

export const router = createHashRouter([
  {
    path: ROUTES.home,
    element: <HomeScreen />,
  },
  {
    path: ROUTES.sessions,
    element: <SessionsScreen />,
  },
  {
    path: `${ROUTES.sessions}/:sessionId`,
    element: <SessionDetailScreen />,
  },
  {
    path: ROUTES.active,
    element: <ActiveSessionScreen />,
  },
  {
    path: ROUTES.sessionEnded,
    element: <SessionEndedScreen />,
  },
])
