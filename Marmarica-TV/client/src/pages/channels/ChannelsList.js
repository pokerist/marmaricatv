import React, { useState, useEffect, useCallback } from 'react';
import { 
  Container, Row, Col, Card, Table, Button, Badge, 
  Form, InputGroup, Dropdown, DropdownButton, Image 
} from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaPlus, FaSearch, FaEdit, FaTrash, FaFilter, FaArrowUp, FaArrowDown, FaPlay, FaStop, FaSync } from 'react-icons/fa';
import { channelsAPI, transcodingAPI } from '../../services/api';
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
  const [isSaving, setIsSaving] = useState(false);

  // Check if any filters are active
  const hasActiveFilters = Boolean(
    filters.type || 
    filters.category || 
    filters.has_news || 
    searchTerm
  );

  // Handle moving channel up
  const handleMoveUp = async (index) => {
    if (index === 0) return; // Already at the top
    
    try {
      setIsSaving(true);
      const items = Array.from(channels);
      const temp = items[index];
      items[index] = items[index - 1];
      items[index - 1] = temp;

      // Update the state optimistically
      setChannels(items);

      // Save the new order to the backend
      const orderedIds = items.map(channel => channel.id);
      await channelsAPI.reorderChannels(orderedIds);
      
      toast.success('Channel moved up successfully');
    } catch (error) {
      console.error('Error moving channel up:', error);
      toast.error('Failed to move channel');
      fetchChannels(); // Refresh on error
    } finally {
      setIsSaving(false);
    }
  };

  // Handle moving channel down
  const handleMoveDown = async (index) => {
    if (index === channels.length - 1) return; // Already at the bottom
    
    try {
      setIsSaving(true);
      const items = Array.from(channels);
      const temp = items[index];
      items[index] = items[index + 1];
      items[index + 1] = temp;

      // Update the state optimistically
      setChannels(items);

      // Save the new order to the backend
      const orderedIds = items.map(channel => channel.id);
      await channelsAPI.reorderChannels(orderedIds);
      
      toast.success('Channel moved down successfully');
    } catch (error) {
      console.error('Error moving channel down:', error);
      toast.error('Failed to move channel');
      fetchChannels(); // Refresh on error
    } finally {
      setIsSaving(false);
    }
  };

  // Save channel order - keeping this as a backup manual save option
  const saveChannelOrder = async () => {
    try {
      setIsSaving(true);
      const orderedIds = channels.map(channel => channel.id);
      await channelsAPI.reorderChannels(orderedIds);
      toast.success('Channel order saved successfully');
    } catch (error) {
      console.error('Error saving channel order:', error);
      toast.error('Failed to save channel order');
      // Refresh the channels to ensure correct order
      fetchChannels();
    } finally {
      setIsSaving(false);
    }
  };

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

  // Handle transcoding toggle
  const handleToggleTranscoding = async (channelId, enabled) => {
    try {
      await transcodingAPI.toggleTranscoding(channelId, enabled);
      toast.success(`Transcoding ${enabled ? 'enabled' : 'disabled'} successfully`);
      fetchChannels(); // Refresh to show updated status
    } catch (error) {
      console.error('Error toggling transcoding:', error);
      toast.error('Failed to toggle transcoding');
    }
  };

  // Handle transcoding restart
  const handleRestartTranscoding = async (channelId) => {
    try {
      await transcodingAPI.restartTranscoding(channelId);
      toast.success('Transcoding restarted successfully');
      fetchChannels(); // Refresh to show updated status
    } catch (error) {
      console.error('Error restarting transcoding:', error);
      toast.error('Failed to restart transcoding');
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
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title">Channels Management</h1>
        <div>
          <Button 
            variant="success" 
            className="me-2" 
            onClick={saveChannelOrder}
            disabled={isSaving || hasActiveFilters}
          >
            {isSaving ? 'Saving...' : 'Save Order'}
          </Button>
          <Link to="/channels/new" className="btn btn-primary">
            <FaPlus className="me-2" /> Add New Channel
          </Link>
        </div>
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
        <Card.Body className="px-0">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="mt-2">Loading channels...</p>
            </div>
          ) : (
            filteredChannels.length > 0 ? (
              <div className="table-responsive">
                {hasActiveFilters && (
                  <div className="alert alert-info mx-3 mb-3">
                    Clear all filters to enable channel reordering
                  </div>
                )}
                <Table hover className="custom-table mx-0">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th style={{ width: '60px' }}>Logo</th>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Category</th>
                      <th>Has News</th>
                      <th>Transcoding</th>
                      <th style={{width: '250px'}}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredChannels.map((channel, index) => (
                      <tr key={channel.id}>
                        <td className="text-center">{index + 1}</td>
                        <td>
                          {channel.logo_url ? (
                            <Image 
                              src={channelsAPI.getLogoUrl(channel.logo_url)} 
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
                          <div className="d-flex flex-column gap-1">
                            {/* Transcoding Status */}
                            <div>
                              {channel.transcoding_enabled ? (
                                channel.transcoding_status === 'active' ? (
                                  <Badge bg="success">
                                    <FaPlay className="me-1" />
                                    Active
                                  </Badge>
                                ) : channel.transcoding_status === 'starting' ? (
                                  <Badge bg="warning">
                                    <FaSync className="me-1" />
                                    Starting
                                  </Badge>
                                ) : channel.transcoding_status === 'stopping' ? (
                                  <Badge bg="warning">
                                    <FaStop className="me-1" />
                                    Stopping
                                  </Badge>
                                ) : channel.transcoding_status === 'failed' ? (
                                  <Badge bg="danger">
                                    Failed
                                  </Badge>
                                ) : (
                                  <Badge bg="secondary">
                                    Inactive
                                  </Badge>
                                )
                              ) : (
                                <Badge bg="secondary">
                                  Disabled
                                </Badge>
                              )}
                            </div>
                            
                            {/* Transcoding Controls */}
                            {channel.transcoding_enabled && (
                              <div className="d-flex gap-1">
                                {channel.transcoding_status === 'active' && (
                                  <Button
                                    variant="outline-warning"
                                    size="sm"
                                    onClick={() => handleRestartTranscoding(channel.id)}
                                    title="Restart Transcoding"
                                  >
                                    <FaSync />
                                  </Button>
                                )}
                                <Button
                                  variant="outline-danger"
                                  size="sm"
                                  onClick={() => handleToggleTranscoding(channel.id, false)}
                                  title="Disable Transcoding"
                                >
                                  <FaStop />
                                </Button>
                              </div>
                            )}
                            
                            {!channel.transcoding_enabled && (
                              <Button
                                variant="outline-success"
                                size="sm"
                                onClick={() => handleToggleTranscoding(channel.id, true)}
                                title="Enable Transcoding"
                              >
                                <FaPlay />
                              </Button>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="d-flex gap-2">
                            {!hasActiveFilters && (
                              <>
                                <Button
                                  variant="outline-secondary"
                                  size="sm"
                                  onClick={() => handleMoveUp(index)}
                                  disabled={index === 0 || isSaving}
                                  title="Move Up"
                                >
                                  <FaArrowUp />
                                </Button>
                                <Button
                                  variant="outline-secondary"
                                  size="sm"
                                  onClick={() => handleMoveDown(index)}
                                  disabled={index === filteredChannels.length - 1 || isSaving}
                                  title="Move Down"
                                >
                                  <FaArrowDown />
                                </Button>
                              </>
                            )}
                            <Link 
                              to={`/channels/edit/${channel.id}`}
                              className="btn btn-sm btn-outline-primary"
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
            )
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
