import { createHashRouter } from 'react-router-dom'
import ExpandedWindowShell from '../components/ExpandedWindowShell'
import ActiveSessionScreen from '../features/active-session/ActiveSessionScreen'
import HomeScreen from '../features/home/HomeScreen'
import SessionEndedScreen from '../features/active-session/SessionEndedScreen'
import SessionDetailScreen from '../features/sessions/SessionDetailScreen'
import SessionsScreen from '../features/sessions/SessionsScreen'
import { ROUTES } from './routes'

export const router = createHashRouter([
  {
    element: <ExpandedWindowShell />,
    children: [
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
    ],
  },
])
