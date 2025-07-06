import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { 
  FaHome, 
  FaMobile, 
  FaTv, 
  FaNewspaper
} from 'react-icons/fa';

const MainLayout = () => {
  // Check if a NavLink is active
  const isActive = ({ isActive }) => 
    isActive ? 'sidebar-item active' : 'sidebar-item';

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
        </header>
        
        {/* Outlet for nested routes */}
        <Outlet />
      </div>
    </div>
  );
};

export default MainLayout;
