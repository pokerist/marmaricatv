import React, { useState, useEffect, useCallback } from 'react';
import { 
  Container, Row, Col, Card, Table, Button, 
  Form, InputGroup, Dropdown, DropdownButton 
} from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaPlus, FaSearch, FaEdit, FaTrash } from 'react-icons/fa';
import { newsAPI } from '../../services/api';
import { toast } from 'react-toastify';

const NewsList = () => {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch news
  const fetchNews = useCallback(async () => {
    try {
      setLoading(true);
      const response = await newsAPI.getAllNews(searchTerm);
      setNews(response.data.data);
    } catch (error) {
      console.error('Error fetching news:', error);
      toast.error('Failed to load news');
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  // Load news on component mount
  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  // Handle search
  const handleSearch = () => {
    fetchNews();
  };

  // Handle search input key press (Enter)
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // Handle news deletion
  const handleDeleteNews = async (id, newsTitle) => {
    if (window.confirm(`Are you sure you want to delete news "${newsTitle}"?`)) {
      try {
        await newsAPI.deleteNews(id);
        toast.success('News deleted successfully');
        fetchNews(); // Refresh the list
      } catch (error) {
        console.error('Error deleting news:', error);
        toast.error('Failed to delete news');
      }
    }
  };

  // Format date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-center">
        <h1 className="page-title">News Management</h1>
        <Link to="/news/new" className="btn btn-primary">
          <FaPlus className="me-2" /> Add News
        </Link>
      </div>
      
      {/* Search */}
      <Card className="mb-4">
        <Card.Body>
          <Row>
            <Col md={6}>
              <InputGroup>
                <InputGroup.Text>
                  <FaSearch />
                </InputGroup.Text>
                <Form.Control
                  placeholder="Search news..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={handleKeyPress}
                />
                <Button 
                  variant="primary" 
                  onClick={handleSearch}
                >
                  Search
                </Button>
              </InputGroup>
            </Col>
          </Row>
        </Card.Body>
      </Card>
      
      {/* News Table */}
      <Card>
        <Card.Body>
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="mt-2">Loading news...</p>
            </div>
          ) : news.length > 0 ? (
            <Table responsive hover className="custom-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Content</th>
                  <th>Created At</th>
                  <th>Updated At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {news.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>
                      <div style={{ maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.body.length > 100 ? `${item.body.substring(0, 100)}...` : item.body}
                      </div>
                    </td>
                    <td>{formatDate(item.created_at)}</td>
                    <td>{formatDate(item.updated_at)}</td>
                    <td>
                      <DropdownButton
                        variant="outline-primary"
                        size="sm"
                        title="Actions"
                      >
                        {/* Edit Action */}
                        <Dropdown.Item as={Link} to={`/news/edit/${item.id}`}>
                          <FaEdit className="me-2" /> Edit News
                        </Dropdown.Item>
                        
                        {/* Delete Action */}
                        <Dropdown.Item 
                          className="text-danger"
                          onClick={() => handleDeleteNews(item.id, item.title)}
                        >
                          <FaTrash className="me-2" /> Delete News
                        </Dropdown.Item>
                      </DropdownButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <div className="text-center py-5">
              <p className="text-muted">No news found</p>
              <Link to="/news/new" className="btn btn-primary">
                <FaPlus className="me-2" /> Add News
              </Link>
            </div>
          )}
        </Card.Body>
      </Card>
    </Container>
  );
};

export default NewsList;
