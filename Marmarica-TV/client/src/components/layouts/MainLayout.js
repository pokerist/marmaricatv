import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { 
  FaHome, 
  FaMobile, 
  FaTv, 
  FaNewspaper,
  FaSignOutAlt,
  FaUser
} from 'react-icons/fa';
import { useAuth } from '../../contexts/AuthContext';

const MainLayout = () => {
  const { admin, logout } = useAuth();

  // Check if a NavLink is active
  const isActive = ({ isActive }) => 
    isActive ? 'sidebar-item active' : 'sidebar-item';

  // Handle logout
  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="main-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-logo">
          Marmarica TV
        </div>
        <div className="sidebar-menu">
          <NavLink to="/" className={isActive} end>
            <span className="sidebar-item-icon"><FaHome /></span>
            Dashboard
          </NavLink>
          <NavLink to="/devices" className={isActive}>
            <span className="sidebar-item-icon"><FaMobile /></span>
            Devices
          </NavLink>
          <NavLink to="/channels" className={isActive}>
            <span className="sidebar-item-icon"><FaTv /></span>
            Channels
          </NavLink>
          <NavLink to="/news" className={isActive}>
            <span className="sidebar-item-icon"><FaNewspaper /></span>
            News
          </NavLink>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="content-area">
        <header className="header">
          <h2>IPTV Admin Panel</h2>
          <div className="header-actions">
            <span className="admin-info">
              <FaUser /> {admin?.username}
            </span>
            <button 
              onClick={handleLogout}
              className="logout-button"
              title="Logout"
            >
              <FaSignOutAlt /> Logout
            </button>
          </div>
        </header>
        
        {/* Outlet for nested routes */}
        <Outlet />
      </div>
    </div>
  );
};

export default MainLayout;
