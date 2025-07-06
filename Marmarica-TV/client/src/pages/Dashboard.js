import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Badge, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaMobile, FaTv, FaNewspaper, FaExclamationTriangle } from 'react-icons/fa';
import { dashboardAPI } from '../services/api';
import { toast } from 'react-toastify';

const Dashboard = () => {
  const [dashboardData, setDashboardData] = useState({
    deviceCount: 0,
    devicesByStatus: {},
    channelCount: 0,
    channelsByType: {},
    newsCount: 0,
    expiringDevices: [],
    recentActions: []
  });
  const [isLoading, setIsLoading] = useState(true);
  
  // Function to clear action history
  const clearActionHistory = async () => {
    try {
      if (window.confirm('Are you sure you want to clear all action history?')) {
        await dashboardAPI.clearActionHistory();
        toast.success('Action history cleared successfully');
        
        // Update dashboard data
        setDashboardData(prev => ({
          ...prev,
          recentActions: []
        }));
      }
    } catch (error) {
      console.error('Error clearing action history:', error);
      toast.error('Failed to clear action history');
    }
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setIsLoading(true);
        const response = await dashboardAPI.getDashboardData();
        setDashboardData(response.data.data);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        toast.error('Failed to load dashboard data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, []);


  // Calculate counts
  const activeDevices = dashboardData.devicesByStatus?.active || 0;
  const disabledDevices = dashboardData.devicesByStatus?.disabled || 0;
  const expiredDevices = dashboardData.devicesByStatus?.expired || 0;

  return (
    <Container fluid>
      <h1 className="page-title">Dashboard</h1>
      
      {/* Summary Cards */}
      <Row className="mb-4">
        <Col md={4}>
          <Card className="dashboard-card">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <h2>{dashboardData.deviceCount || 0}</h2>
                  <div>Total Devices</div>
                  <div className="text-muted small mt-2">
                    <span className="text-success">{activeDevices} Active</span> | 
                    <span className="text-secondary"> {disabledDevices} Disabled</span> | 
                    <span className="text-danger"> {expiredDevices} Expired</span>
                  </div>
                </div>
                <FaMobile size={40} className="text-primary opacity-50" />
              </div>
            </Card.Body>
            <Card.Footer className="bg-white border-0 text-end">
              <Link to="/devices" className="btn btn-sm btn-outline-primary">View Devices</Link>
            </Card.Footer>
          </Card>
        </Col>
        
        <Col md={4}>
          <Card className="dashboard-card">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <h2>{dashboardData.channelCount || 0}</h2>
                  <div>Total Channels</div>
                  <div className="text-muted small mt-2">
                    <span className="text-primary">FTA: {dashboardData.channelsByType?.FTA || 0}</span> | 
                    <span className="text-warning"> BeIN: {dashboardData.channelsByType?.BeIN || 0}</span> | 
                    <span className="text-success"> Local: {dashboardData.channelsByType?.Local || 0}</span>
                  </div>
                </div>
                <FaTv size={40} className="text-primary opacity-50" />
              </div>
            </Card.Body>
            <Card.Footer className="bg-white border-0 text-end">
              <Link to="/channels" className="btn btn-sm btn-outline-primary">View Channels</Link>
            </Card.Footer>
          </Card>
        </Col>
        
        <Col md={4}>
          <Card className="dashboard-card">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <h2>{dashboardData.newsCount || 0}</h2>
                  <div>Total News Items</div>
                </div>
                <FaNewspaper size={40} className="text-primary opacity-50" />
              </div>
            </Card.Body>
            <Card.Footer className="bg-white border-0 text-end">
              <Link to="/news" className="btn btn-sm btn-outline-primary">View News</Link>
            </Card.Footer>
          </Card>
        </Col>
      </Row>
      
      {/* Expiring Devices */}
      <Row className="mb-4">
        <Col md={6}>
          <Card className="dashboard-card">
            <Card.Header className="bg-white">
              <div className="d-flex align-items-center">
                <FaExclamationTriangle className="text-warning me-2" />
                <h5 className="mb-0">Devices Expiring Soon</h5>
              </div>
            </Card.Header>
            <Card.Body>
              {dashboardData.expiringDevices && dashboardData.expiringDevices.length > 0 ? (
                <Table responsive hover className="custom-table">
                  <thead>
                    <tr>
                      <th>DUID</th>
                      <th>Owner</th>
                      <th>Expiry Date</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardData.expiringDevices.map((device) => (
                      <tr key={device.id}>
                        <td>{device.duid}</td>
                        <td>{device.owner_name}</td>
                        <td>{new Date(device.expiry_date).toLocaleDateString()}</td>
                        <td>
                          <Link 
                            to={`/devices/edit/${device.id}`} 
                            className="btn btn-sm btn-outline-primary"
                          >
                            Extend
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <div className="text-center text-muted py-3">
                  No devices expiring in the next 7 days
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
        
        {/* Recent Actions */}
        <Col md={6}>
          <Card className="dashboard-card">
            <Card.Header className="bg-white d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Recent System Activities</h5>
              {dashboardData.recentActions && dashboardData.recentActions.length > 0 && (
                <Button 
                  variant="outline-danger" 
                  size="sm"
                  onClick={clearActionHistory}
                >
                  Clear History
                </Button>
              )}
            </Card.Header>
            <Card.Body className="p-0"> {/* Remove padding for table */}
              {dashboardData.recentActions && dashboardData.recentActions.length > 0 ? (
                <div style={{ maxHeight: '300px', overflow: 'auto' }}>
                  <Table responsive hover className="custom-table mb-0">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Description</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardData.recentActions.map((action) => (
                        <tr key={action.id}>
                          <td>
                            <Badge bg="info">{action.action_type.replace('_', ' ')}</Badge>
                          </td>
                          <td>{action.description}</td>
                          <td>{new Date(action.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              ) : (
                <div className="text-center text-muted py-3">
                  No recent activities
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default Dashboard;
