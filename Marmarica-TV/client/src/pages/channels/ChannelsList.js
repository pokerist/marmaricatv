import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Table, Button, Container, Row, Col, Form } from 'react-bootstrap';
import { FaEdit, FaTrash, FaGripVertical } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { channelsAPI } from '../../services/api';

const ChannelsList = () => {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    type: '',
    category: '',
    has_news: ''
  });

  // Load channels
  const loadChannels = async () => {
    try {
      const response = await channelsAPI.getAllChannels(filters);
      setChannels(response.data);
    } catch (error) {
      console.error('Error loading channels:', error);
      toast.error('Failed to load channels');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChannels();
  }, [filters]);

  // Handle channel deletion
  const handleDelete = async (id, name) => {
    if (window.confirm(`Are you sure you want to delete channel "${name}"?`)) {
      try {
        await channelsAPI.deleteChannel(id);
        toast.success('Channel deleted successfully');
        loadChannels();
      } catch (error) {
        console.error('Error deleting channel:', error);
        toast.error('Failed to delete channel');
      }
    }
  };

  // Handle drag end
  const handleDragEnd = async (result) => {
    if (!result.destination) return;

    const items = Array.from(channels);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update local state immediately for smooth UI
    setChannels(items);

    // Send the new order to the server
    try {
      await channelsAPI.reorderChannels(items.map(channel => channel.id));
      toast.success('Channel order updated');
    } catch (error) {
      console.error('Error updating channel order:', error);
      toast.error('Failed to update channel order');
      // Reload the original order on error
      loadChannels();
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <Container fluid>
      <Row className="mb-4">
        <Col>
          <h2>Channels</h2>
        </Col>
        <Col xs="auto">
          <Link to="/channels/new">
            <Button variant="primary">Add Channel</Button>
          </Link>
        </Col>
      </Row>

      {/* Filters */}
      <Row className="mb-4">
        <Col md={3}>
          <Form.Group>
            <Form.Label>Type</Form.Label>
            <Form.Control
              as="select"
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
            >
              <option value="">All Types</option>
              <option value="FTA">FTA</option>
              <option value="Local">Local</option>
            </Form.Control>
          </Form.Group>
        </Col>
        <Col md={3}>
          <Form.Group>
            <Form.Label>Category</Form.Label>
            <Form.Control
              as="select"
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            >
              <option value="">All Categories</option>
              <option value="News">News</option>
              <option value="Sports">Sports</option>
              <option value="Entertainment">Entertainment</option>
            </Form.Control>
          </Form.Group>
        </Col>
        <Col md={3}>
          <Form.Group>
            <Form.Label>Has News</Form.Label>
            <Form.Control
              as="select"
              value={filters.has_news}
              onChange={(e) => setFilters({ ...filters, has_news: e.target.value })}
            >
              <option value="">All</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </Form.Control>
          </Form.Group>
        </Col>
      </Row>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="channels">
          {(provided) => (
            <Table responsive hover {...provided.droppableProps} ref={provided.innerRef}>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>Logo</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Has News</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((channel, index) => (
                  <Draggable 
                    key={channel.id} 
                    draggableId={channel.id.toString()} 
                    index={index}
                  >
                    {(provided, snapshot) => (
                      <tr
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={snapshot.isDragging ? 'dragging' : ''}
                      >
                        <td {...provided.dragHandleProps}>
                          <FaGripVertical className="text-muted" />
                        </td>
                        <td>
                          {channel.logo_url && (
                            <img 
                              src={channelsAPI.getLogoUrl(channel.logo_url)}
                              alt={channel.name}
                              style={{ height: '30px' }}
                            />
                          )}
                        </td>
                        <td>{channel.name}</td>
                        <td>{channel.type}</td>
                        <td>{channel.category}</td>
                        <td>{channel.has_news ? 'Yes' : 'No'}</td>
                        <td>
                          <Link 
                            to={`/channels/edit/${channel.id}`}
                            className="btn btn-sm btn-outline-primary me-2"
                          >
                            <FaEdit />
                          </Link>
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => handleDelete(channel.id, channel.name)}
                          >
                            <FaTrash />
                          </Button>
                        </td>
                      </tr>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </tbody>
            </Table>
          )}
        </Droppable>
      </DragDropContext>

      <style jsx>{`
        .dragging {
          background-color: rgba(0, 123, 255, 0.1);
        }
        tr {
          cursor: move;
        }
        .text-muted {
          cursor: grab;
        }
      `}</style>
    </Container>
  );
};

export default ChannelsList;
