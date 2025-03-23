import React, { useState, useEffect, useCallback } from 'react';
import { 
  Container, Row, Col, Card, Table, Button, Badge, 
  Form, InputGroup, Dropdown, DropdownButton 
} from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaPlus, FaSearch, FaEdit, FaTrash, FaFilter, FaCheckCircle, FaBan } from 'react-icons/fa';
import { devicesAPI } from '../../services/api';
import { toast } from 'react-toastify';

const DevicesList = () => {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: '',
    expiring: false
  });
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch devices based on current filters
  const fetchDevices = useCallback(async () => {
    try {
      setLoading(true);
      const response = await devicesAPI.getAllDevices(filters);
      setDevices(response.data.data);
    } catch (error) {
      console.error('Error fetching devices:', error);
      toast.error('Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Load devices on component mount and when filters change
  useEffect(() => {
    fetchDevices();
  }, [filters, fetchDevices]);

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    setFilters(prevFilters => ({
      ...prevFilters,
      [key]: value
    }));
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters({
      status: '',
      expiring: false
    });
    setSearchTerm('');
  };

  // Handle device deletion
  const handleDeleteDevice = async (id, deviceName) => {
    if (window.confirm(`Are you sure you want to delete device "${deviceName}"?`)) {
      try {
        await devicesAPI.deleteDevice(id);
        toast.success('Device deleted successfully');
        fetchDevices(); // Refresh the list
      } catch (error) {
        console.error('Error deleting device:', error);
        toast.error('Failed to delete device');
      }
    }
  };

  // Handle device status change
  const handleStatusChange = async (id, newStatus, deviceName) => {
    try {
      await devicesAPI.updateDevice(id, { status: newStatus });
      toast.success(`Device status updated to ${newStatus}`);
      fetchDevices(); // Refresh the list
    } catch (error) {
      console.error('Error updating device status:', error);
      toast.error('Failed to update device status');
    }
  };

  // Filter devices by search term (client-side)
  const filteredDevices = devices.filter(device => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      device.duid.toLowerCase().includes(searchLower) ||
      device.owner_name.toLowerCase().includes(searchLower) ||
      device.activation_code.toLowerCase().includes(searchLower)
    );
  });

  // Render status badge
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return <Badge bg="success">Active</Badge>;
      case 'disabled':
        return <Badge bg="secondary">Disabled</Badge>;
      case 'expired':
        return <Badge bg="danger">Expired</Badge>;
      default:
        return <Badge bg="info">{status}</Badge>;
    }
  };

  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-center">
        <h1 className="page-title">Devices Management</h1>
        <Link to="/devices/new" className="btn btn-primary">
          <FaPlus className="me-2" /> Add New Device
        </Link>
      </div>
      
      {/* Filters and Search */}
      <Card className="mb-4">
        <Card.Body>
          <Row>
            <Col md={4}>
              <InputGroup className="mb-3">
                <InputGroup.Text>
                  <FaSearch />
                </InputGroup.Text>
                <Form.Control
                  placeholder="Search by DUID, Name, or Code"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </InputGroup>
            </Col>
            <Col md={3}>
              <InputGroup className="mb-3">
                <InputGroup.Text>
                  <FaFilter />
                </InputGroup.Text>
                <Form.Select
                  value={filters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                  <option value="expired">Expired</option>
                </Form.Select>
              </InputGroup>
            </Col>
            <Col md={3}>
              <Form.Check
                type="switch"
                id="expiring-switch"
                label="Show expiring devices only"
                checked={filters.expiring}
                onChange={(e) => handleFilterChange('expiring', e.target.checked)}
                className="mt-2"
              />
            </Col>
            <Col md={2} className="text-end">
              <Button variant="outline-secondary" onClick={clearFilters}>
                Clear Filters
              </Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>
      
      {/* Devices Table */}
      <Card>
        <Card.Body className="px-0"> {/* Reduced horizontal padding */}
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="mt-2">Loading devices...</p>
            </div>
          ) : filteredDevices.length > 0 ? (
            <div className="table-responsive">
              <Table hover className="custom-table mx-0">
                <thead>
                  <tr>
                    <th>DUID</th>
                    <th>Owner Name</th>
                    <th>Activation Code</th>
                    <th>Allowed Types</th>
                    <th>Expiry Date</th>
                    <th>Status</th>
                    <th style={{width: '200px'}}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDevices.map((device) => (
                    <tr key={device.id}>
                      <td>{device.duid}</td>
                      <td>{device.owner_name}</td>
                      <td>{device.activation_code}</td>
                      <td>{device.allowed_types}</td>
                      <td>{new Date(device.expiry_date).toLocaleDateString()}</td>
                      <td>{renderStatusBadge(device.status)}</td>
                      <td>
                        <div className="d-flex flex-wrap">
                          {/* Status Change Actions */}
                          {device.status !== 'active' && (
                            <Button 
                              variant="outline-success"
                              size="sm"
                              className="me-1 mb-1"
                              onClick={() => handleStatusChange(device.id, 'active', device.owner_name)}
                              title="Enable Device"
                            >
                              <FaCheckCircle /> Enable
                            </Button>
                          )}
                          
                          {device.status !== 'disabled' && (
                            <Button 
                              variant="outline-secondary"
                              size="sm"
                              className="me-1 mb-1"
                              onClick={() => handleStatusChange(device.id, 'disabled', device.owner_name)}
                              title="Disable Device"
                            >
                              <FaBan /> Disable
                            </Button>
                          )}
                          
                          {/* Edit Action */}
                          <Link 
                            to={`/devices/edit/${device.id}`}
                            className="btn btn-sm btn-outline-primary me-1 mb-1"
                            title="Edit Device"
                          >
                            <FaEdit /> Edit
                          </Link>
                          
                          {/* Delete Action */}
                          <Button
                            variant="outline-danger"
                            size="sm"
                            className="mb-1"
                            onClick={() => handleDeleteDevice(device.id, device.owner_name)}
                            title="Delete Device"
                          >
                            <FaTrash /> Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-5">
              <p className="text-muted">No devices found matching the current filters</p>
              {(filters.status || filters.expiring || searchTerm) && (
                <Button variant="link" onClick={clearFilters}>
                  Clear filters and try again
                </Button>
              )}
            </div>
          )}
        </Card.Body>
      </Card>
    </Container>
  );
};

export default DevicesList;
