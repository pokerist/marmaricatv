import React, { useState, useEffect, useCallback } from 'react';
import { 
  Container, Row, Col, Card, Table, Button, Badge, 
  Form, InputGroup, Dropdown, DropdownButton, Image 
} from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaPlus, FaSearch, FaEdit, FaTrash, FaFilter } from 'react-icons/fa';
import { channelsAPI } from '../../services/api';
import { toast } from 'react-toastify';

const ChannelsList = () => {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    type: '',
    category: '',
    has_news: ''
  });
  const [searchTerm, setSearchTerm] = useState('');

  // Categories list
  const categories = [
    'Religious', 'News', 'Movies', 'Family', 'Sports',
    'Entertainment', 'Kids', 'Documentary', 'Music', 'General'
  ];

  // Fetch channels based on current filters - only for initial load, not for filtering
  const fetchChannels = useCallback(async () => {
    try {
      setLoading(true);
      // Remove the filters from the API call to get all channels initially
      const response = await channelsAPI.getAllChannels({});
      setChannels(response.data.data);
    } catch (error) {
      console.error('Error fetching channels:', error);
      toast.error('Failed to load channels');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load all channels on component mount
  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

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
      type: '',
      category: '',
      has_news: ''
    });
    setSearchTerm('');
  };

  // Handle channel deletion
  const handleDeleteChannel = async (id, channelName) => {
    if (window.confirm(`Are you sure you want to delete channel "${channelName}"?`)) {
      try {
        await channelsAPI.deleteChannel(id);
        toast.success('Channel deleted successfully');
        fetchChannels(); // Refresh the list
      } catch (error) {
        console.error('Error deleting channel:', error);
        toast.error('Failed to delete channel');
      }
    }
  };

  // Filter channels by search term and filters (client-side)
  const filteredChannels = channels.filter(channel => {
    // Text search
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        channel.name.toLowerCase().includes(searchLower) ||
        channel.url.toLowerCase().includes(searchLower) ||
        channel.type.toLowerCase().includes(searchLower) ||
        channel.category.toLowerCase().includes(searchLower);
      
      if (!matchesSearch) return false;
    }
    
    // Type filter
    if (filters.type && channel.type !== filters.type) {
      return false;
    }
    
    // Category filter
    if (filters.category && channel.category !== filters.category) {
      return false;
    }
    
    // Has news filter
    if (filters.has_news !== '') {
      const hasNewsValue = filters.has_news === 'true';
      // Convert to boolean - handle both number (1/0) and boolean values
      const channelHasNews = Boolean(channel.has_news);
      if (hasNewsValue !== channelHasNews) {
        return false;
      }
    }
    
    return true;
  });

  // Render channel type badge
  const renderTypeBadge = (type) => {
    switch (type) {
      case 'FTA':
        return <Badge bg="primary">FTA</Badge>;
      case 'BeIN':
        return <Badge bg="warning" text="dark">BeIN</Badge>;
      case 'Local':
        return <Badge bg="success">Local</Badge>;
      default:
        return <Badge bg="secondary">{type}</Badge>;
    }
  };

  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-center">
        <h1 className="page-title">Channels Management</h1>
        <Link to="/channels/new" className="btn btn-primary">
          <FaPlus className="me-2" /> Add New Channel
        </Link>
      </div>
      
      {/* Filters and Search */}
      <Card className="mb-4">
        <Card.Body>
          <Row>
            <Col md={3}>
              <InputGroup className="mb-3">
                <InputGroup.Text>
                  <FaSearch />
                </InputGroup.Text>
                <Form.Control
                  placeholder="Search channels..."
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
                  value={filters.type}
                  onChange={(e) => handleFilterChange('type', e.target.value)}
                >
                  <option value="">All Types</option>
                  <option value="FTA">FTA</option>
                  <option value="BeIN">BeIN</option>
                  <option value="Local">Local</option>
                </Form.Select>
              </InputGroup>
            </Col>
            <Col md={3}>
              <InputGroup className="mb-3">
                <InputGroup.Text>
                  <FaFilter />
                </InputGroup.Text>
                <Form.Select
                  value={filters.category}
                  onChange={(e) => handleFilterChange('category', e.target.value)}
                >
                  <option value="">All Categories</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </Form.Select>
              </InputGroup>
            </Col>
            <Col md={2}>
              <Form.Select
                value={filters.has_news}
                onChange={(e) => handleFilterChange('has_news', e.target.value)}
                className="mb-3"
              >
                <option value="">All News Status</option>
                <option value="true">Has News</option>
                <option value="false">No News</option>
              </Form.Select>
            </Col>
            <Col md={1} className="text-end">
              <Button variant="outline-secondary" onClick={clearFilters}>
                Clear
              </Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>
      
      {/* Channels Table */}
      <Card>
        <Card.Body className="px-0"> {/* Reduced horizontal padding */}
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="mt-2">Loading channels...</p>
            </div>
          ) : filteredChannels.length > 0 ? (
            <div className="table-responsive">
              <Table hover className="custom-table mx-0">
                <thead>
                  <tr>
                    <th style={{ width: '60px' }}>Logo</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th>Has News</th>
                    <th style={{width: '120px'}}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredChannels.map((channel) => (
                    <tr key={channel.id}>
                      <td>
                        {channel.logo_url ? (
                          <Image 
                            src={`http://localhost:5000${channel.logo_url}`} 
                            rounded 
                            width="40" 
                            height="40" 
                            className="object-fit-cover"
                          />
                        ) : (
                          <div 
                            className="bg-secondary text-white rounded d-flex align-items-center justify-content-center"
                            style={{ width: '40px', height: '40px' }}
                          >
                            <small>No Logo</small>
                          </div>
                        )}
                      </td>
                      <td>
                        {channel.name}
                        <div className="text-muted small text-truncate" style={{ maxWidth: '200px' }}>
                          {channel.url}
                        </div>
                      </td>
                      <td>{renderTypeBadge(channel.type)}</td>
                      <td>{channel.category}</td>
                      <td>
                        {channel.has_news ? (
                          <Badge bg="success">Yes</Badge>
                        ) : (
                          <Badge bg="secondary">No</Badge>
                        )}
                      </td>
                      <td>
                        <div className="d-flex">
                          <Link 
                            to={`/channels/edit/${channel.id}`}
                            className="btn btn-sm btn-outline-primary me-2"
                          >
                            <FaEdit /> Edit
                          </Link>
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => handleDeleteChannel(channel.id, channel.name)}
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
              <p className="text-muted">No channels found matching the current filters</p>
              {(filters.type || filters.category || filters.has_news || searchTerm) && (
                <Button variant="link" onClick={clearFilters}>
                  Clear filters and try again
                </Button>
              )}
            </div>
          )}
        </Card.Body>
      </Card>
      
      {/* Debug info - only for development */}
      {process.env.NODE_ENV === 'development' && (
        <Card className="mt-4">
          <Card.Header>Debug Information</Card.Header>
          <Card.Body>
            <p>Total channels: {channels.length}</p>
            <p>Filtered channels: {filteredChannels.length}</p>
            <p>Filters: {JSON.stringify(filters)}</p>
          </Card.Body>
        </Card>
      )}
    </Container>
  );
};

export default ChannelsList;
