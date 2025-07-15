import React, { useState, useEffect, useCallback } from 'react';
import { 
  Container, Row, Col, Card, Table, Button, Badge, 
  Form, InputGroup, Dropdown, DropdownButton, Image 
} from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaPlus, FaSearch, FaEdit, FaTrash, FaFilter, FaArrowUp, FaArrowDown, FaPlay, FaStop, FaSync, FaUpload } from 'react-icons/fa';
import { channelsAPI, transcodingAPI } from '../../services/api';
import { toast } from 'react-toastify';
import M3U8Upload from '../../components/M3U8Upload';
import BulkTranscodingModal from '../../components/BulkTranscodingModal';
import DeleteAllChannelsModal from '../../components/DeleteAllChannelsModal';

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
  const [showM3U8Upload, setShowM3U8Upload] = useState(false);
  const [showBulkTranscoding, setShowBulkTranscoding] = useState(false);
  const [showDeleteAllChannels, setShowDeleteAllChannels] = useState(false);
  const [transcodingActions, setTranscodingActions] = useState(new Set());
  const [pollingInterval, setPollingInterval] = useState(null);

  // Handle M3U8 import success
  const handleImportSuccess = (results) => {
    fetchChannels(); // Refresh the channel list
  };

  // Handle bulk transcoding success
  const handleTranscodingSuccess = (results) => {
    fetchChannels(); // Refresh the channel list
  };

  // Handle delete all channels success
  const handleDeleteAllSuccess = (results) => {
    fetchChannels(); // Refresh the channel list
  };

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

  // Start polling for transcoding status updates when there are active transcoding operations
  useEffect(() => {
    const hasActiveTranscoding = channels.some(channel => 
      channel.transcoding_enabled && 
      ['starting', 'stopping', 'running'].includes(channel.transcoding_status)
    );

    if (hasActiveTranscoding && !pollingInterval) {
      const interval = setInterval(fetchChannels, 3000); // Poll every 3 seconds
      setPollingInterval(interval);
    } else if (!hasActiveTranscoding && pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }

    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [channels, pollingInterval, fetchChannels]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

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
    // Add to tracking set for UI feedback
    setTranscodingActions(prev => new Set(prev).add(channelId));
    
    try {
      // Update channel state optimistically
      setChannels(prevChannels => 
        prevChannels.map(channel => 
          channel.id === channelId 
            ? { 
                ...channel, 
                transcoding_enabled: enabled,
                transcoding_status: enabled ? 'starting' : 'stopping'
              }
            : channel
        )
      );

      await transcodingAPI.toggleTranscoding(channelId, enabled);
      toast.success(`Transcoding ${enabled ? 'enabled' : 'disabled'} successfully`);
      
      // Refresh to get actual status
      setTimeout(fetchChannels, 1000);
    } catch (error) {
      console.error('Error toggling transcoding:', error);
      toast.error('Failed to toggle transcoding');
      // Revert optimistic update on error
      fetchChannels();
    } finally {
      // Remove from tracking set
      setTranscodingActions(prev => {
        const newSet = new Set(prev);
        newSet.delete(channelId);
        return newSet;
      });
    }
  };

  // Handle transcoding restart
  const handleRestartTranscoding = async (channelId) => {
    // Add to tracking set for UI feedback
    setTranscodingActions(prev => new Set(prev).add(channelId));
    
    try {
      // Update channel state optimistically
      setChannels(prevChannels => 
        prevChannels.map(channel => 
          channel.id === channelId 
            ? { ...channel, transcoding_status: 'starting' }
            : channel
        )
      );

      await transcodingAPI.restartTranscoding(channelId);
      toast.success('Transcoding restarted successfully');
      
      // Refresh to get actual status
      setTimeout(fetchChannels, 1000);
    } catch (error) {
      console.error('Error restarting transcoding:', error);
      toast.error('Failed to restart transcoding');
      // Revert optimistic update on error
      fetchChannels();
    } finally {
      // Remove from tracking set
      setTranscodingActions(prev => {
        const newSet = new Set(prev);
        newSet.delete(channelId);
        return newSet;
      });
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
            variant="info" 
            className="me-2" 
            onClick={() => setShowM3U8Upload(true)}
          >
            <FaUpload className="me-2" /> Import M3U8
          </Button>
          <Button 
            variant="warning" 
            className="me-2" 
            onClick={() => setShowBulkTranscoding(true)}
          >
            <FaPlay className="me-2" /> Bulk Transcoding
          </Button>
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
      
      {/* Channel Summary */}
      <Card className="mt-4">
        <Card.Header className="bg-light">
          <h5 className="mb-0">📊 Channel Summary</h5>
        </Card.Header>
        <Card.Body>
          <Row>
            <Col md={3}>
              <div className="text-center p-3 border rounded">
                <h4 className="text-primary mb-1">{channels.length}</h4>
                <small className="text-muted">Total Channels</small>
              </div>
            </Col>
            <Col md={3}>
              <div className="text-center p-3 border rounded">
                <h4 className="text-success mb-1">{filteredChannels.length}</h4>
                <small className="text-muted">After Filters</small>
              </div>
            </Col>
            <Col md={3}>
              <div className="text-center p-3 border rounded">
                <h4 className="text-info mb-1">
                  {channels.filter(c => c.transcoding_enabled).length}
                </h4>
                <small className="text-muted">Transcoding Enabled</small>
              </div>
            </Col>
            <Col md={3}>
              <div className="text-center p-3 border rounded">
                <h4 className="text-warning mb-1">
                  {channels.filter(c => c.transcoding_status === 'active').length}
                </h4>
                <small className="text-muted">Active Transcoding</small>
              </div>
            </Col>
          </Row>
          
          <hr className="my-4" />
          
          <Row>
            <Col md={6}>
              <h6 className="mb-3">📺 Channels by Type</h6>
              <div className="d-flex flex-wrap gap-2">
                {['FTA', 'BeIN', 'Local'].map(type => {
                  const count = channels.filter(c => c.type === type).length;
                  return (
                    <Badge key={type} bg={type === 'FTA' ? 'primary' : type === 'BeIN' ? 'warning' : 'success'} className="p-2">
                      {type}: {count}
                    </Badge>
                  );
                })}
              </div>
            </Col>
            <Col md={6}>
              <h6 className="mb-3">📂 Channels by Category</h6>
              <div className="d-flex flex-wrap gap-1">
                {categories.map(category => {
                  const count = channels.filter(c => c.category === category).length;
                  return count > 0 ? (
                    <Badge key={category} bg="secondary" className="p-1">
                      {category}: {count}
                    </Badge>
                  ) : null;
                })}
              </div>
            </Col>
          </Row>
          
          {hasActiveFilters && (
            <>
              <hr className="my-4" />
              <div className="alert alert-info mb-0">
                <h6 className="mb-2">🔍 Current Filters:</h6>
                <ul className="mb-0">
                  {filters.type && <li>Type: <strong>{filters.type}</strong></li>}
                  {filters.category && <li>Category: <strong>{filters.category}</strong></li>}
                  {filters.has_news && <li>Has News: <strong>{filters.has_news === 'true' ? 'Yes' : 'No'}</strong></li>}
                  {searchTerm && <li>Search: <strong>"{searchTerm}"</strong></li>}
                </ul>
              </div>
            </>
          )}
          
          {channels.length > 0 && (
            <>
              <hr className="my-4" />
              <div className="text-center">
                <Button 
                  variant="danger" 
                  size="sm"
                  onClick={() => setShowDeleteAllChannels(true)}
                  className="px-4"
                >
                  <FaTrash className="me-2" />
                  Delete All Channels ({channels.length})
                </Button>
                <div className="text-muted small mt-2">
                  ⚠️ This will permanently delete all channels and stop active transcoding
                </div>
              </div>
            </>
          )}
        </Card.Body>
      </Card>
      
      {/* M3U8 Upload Modal */}
      <M3U8Upload 
        show={showM3U8Upload}
        onHide={() => setShowM3U8Upload(false)}
        onImportSuccess={handleImportSuccess}
      />
      
      {/* Bulk Transcoding Modal */}
      <BulkTranscodingModal 
        show={showBulkTranscoding}
        onHide={() => setShowBulkTranscoding(false)}
        onTranscodingSuccess={handleTranscodingSuccess}
      />
      
      {/* Delete All Channels Modal */}
      <DeleteAllChannelsModal 
        show={showDeleteAllChannels}
        onHide={() => setShowDeleteAllChannels(false)}
        onDeleteSuccess={handleDeleteAllSuccess}
        totalChannels={channels.length}
      />
    </Container>
  );
};

export default ChannelsList;
