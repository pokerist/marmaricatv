import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { 
  FaHome, 
  FaMobile, 
  FaTv, 
  FaNewspaper,
  FaUserCog,
  FaSignOutAlt
} from 'react-icons/fa';
import { Dropdown } from 'react-bootstrap';
import { useAuth } from '../auth/AuthContext';

const MainLayout = () => {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();

  // Check if a NavLink is active
  const isActive = ({ isActive }) => 
    isActive ? 'sidebar-item active' : 'sidebar-item';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
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
          <div className="user-controls">
            <Dropdown align="end">
              <Dropdown.Toggle variant="light" id="user-dropdown">
                <FaUserCog className="me-2" />
                {admin?.username}
              </Dropdown.Toggle>

              <Dropdown.Menu>
                <Dropdown.Item onClick={() => navigate('/change-password')}>
                  <FaUserCog className="me-2" />
                  Change Password
                </Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item onClick={handleLogout}>
                  <FaSignOutAlt className="me-2" />
                  Logout
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </div>
        </header>
        
        {/* Outlet for nested routes */}
        <Outlet />
      </div>

      <style jsx>{`
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 2rem;
          background: #fff;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .user-controls {
          display: flex;
          align-items: center;
        }

        .user-controls .dropdown-toggle {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .user-controls .dropdown-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
      `}</style>
    </div>
  );
};

export default MainLayout;
