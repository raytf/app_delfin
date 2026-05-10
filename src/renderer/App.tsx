import { RouterProvider } from 'react-router-dom'
import { router } from './navigation/router'

export default function App() {
  return <RouterProvider router={router} />
}
