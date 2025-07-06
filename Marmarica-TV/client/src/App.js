import React from 'react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  Navigate,
  createRoutesFromElements,
  createBrowserRouter,
  RouterProvider
} from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Layouts
import MainLayout from './components/layouts/MainLayout';

// Pages
import Dashboard from './pages/Dashboard';
import DevicesList from './pages/devices/DevicesList';
import DeviceForm from './pages/devices/DeviceForm';
import ChannelsList from './pages/channels/ChannelsList';
import ChannelForm from './pages/channels/ChannelForm';
import NewsList from './pages/news/NewsList';
import NewsForm from './pages/news/NewsForm';
import NotFound from './pages/NotFound';

// Create router with future flags enabled
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<MainLayout />}>
      {/* Dashboard */}
      <Route index element={<Dashboard />} />
      
      {/* Devices */}
      <Route path="devices" element={<DevicesList />} />
      <Route path="devices/new" element={<DeviceForm />} />
      <Route path="devices/edit/:id" element={<DeviceForm />} />
      
      {/* Channels */}
      <Route path="channels" element={<ChannelsList />} />
      <Route path="channels/new" element={<ChannelForm />} />
      <Route path="channels/edit/:id" element={<ChannelForm />} />
      
      {/* News */}
      <Route path="news" element={<NewsList />} />
      <Route path="news/new" element={<NewsForm />} />
      <Route path="news/edit/:id" element={<NewsForm />} />
      
      {/* Not Found */}
      <Route path="404" element={<NotFound />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Route>
  ),
  {
    // Enable future flags to suppress warnings
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true
    }
  }
);

function App() {
  return (
    <>
      <ToastContainer position="top-right" autoClose={3000} />
      <RouterProvider router={router} />
    </>
  );
}

export default App;
