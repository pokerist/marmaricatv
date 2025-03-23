import React, { useState, useEffect } from 'react';
import { Container, Card, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Formik } from 'formik';
import * as Yup from 'yup';
import { newsAPI } from '../../services/api';
import { toast } from 'react-toastify';

// Validation schema
const NewsSchema = Yup.object().shape({
  title: Yup.string()
    .required('Title is required')
    .min(3, 'Title must be at least 3 characters'),
  body: Yup.string()
    .required('Content is required')
    .min(10, 'Content must be at least 10 characters')
});

const NewsForm = () => {
  const { id } = useParams(); // Get ID from URL if editing
  const navigate = useNavigate();
  const isEditing = !!id;
  
  const [loading, setLoading] = useState(isEditing);
  const [newsItem, setNewsItem] = useState(null);
  const [error, setError] = useState('');
  
  // Load news data if editing
  useEffect(() => {
    if (isEditing) {
      const fetchNewsItem = async () => {
        try {
          setLoading(true);
          const response = await newsAPI.getNewsById(id);
          setNewsItem(response.data.data);
        } catch (error) {
          console.error('Error fetching news:', error);
          setError('Failed to load news data. Please try again.');
          toast.error('Could not load news data');
        } finally {
          setLoading(false);
        }
      };
      
      fetchNewsItem();
    }
  }, [id, isEditing]);
  
  // Handle form submission
  const handleSubmit = async (values, { setSubmitting, resetForm }) => {
    try {
      setSubmitting(true);
      
      if (isEditing) {
        // Update existing news
        await newsAPI.updateNews(id, values);
        toast.success('News updated successfully');
        navigate('/news');
      } else {
        // Create new news
        await newsAPI.createNews(values);
        toast.success('News created successfully');
        resetForm();
      }
    } catch (error) {
      console.error('Error saving news:', error);
      toast.error('Failed to save news');
    } finally {
      setSubmitting(false);
    }
  };
  
  // Prepare initial values for the form
  const getInitialValues = () => {
    if (isEditing && newsItem) {
      return {
        title: newsItem.title || '',
        body: newsItem.body || ''
      };
    }
    
    // Default values for new news
    return {
      title: '',
      body: ''
    };
  };
  
  // Show loader while fetching news data
  if (isEditing && loading) {
    return (
      <Container className="py-5 text-center">
        <Spinner animation="border" role="status" className="mb-3">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
        <p>Loading news data...</p>
      </Container>
    );
  }
  
  // Show error if failed to load news
  if (isEditing && error && !newsItem) {
    return (
      <Container className="py-5">
        <Alert variant="danger">
          {error}
          <div className="mt-3">
            <Link to="/news" className="btn btn-primary">Back to News</Link>
          </div>
        </Alert>
      </Container>
    );
  }

  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-center">
        <h1 className="page-title">{isEditing ? 'Edit News' : 'Add News'}</h1>
        <Link to="/news" className="btn btn-outline-secondary">
          Back to News List
        </Link>
      </div>
      
      <Card className="form-container">
        <Card.Body>
          <Formik
            initialValues={getInitialValues()}
            validationSchema={NewsSchema}
            onSubmit={handleSubmit}
            enableReinitialize={true}
          >
            {({
              values,
              errors,
              touched,
              handleChange,
              handleBlur,
              handleSubmit,
              isSubmitting
            }) => (
              <Form onSubmit={handleSubmit}>
                {/* News Title */}
                <Form.Group className="mb-3">
                  <Form.Label>Title</Form.Label>
                  <Form.Control
                    type="text"
                    name="title"
                    value={values.title}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    isInvalid={touched.title && errors.title}
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.title}
                  </Form.Control.Feedback>
                </Form.Group>
                
                {/* News Content */}
                <Form.Group className="mb-3">
                  <Form.Label>Content</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={10}
                    name="body"
                    value={values.body}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    isInvalid={touched.body && errors.body}
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.body}
                  </Form.Control.Feedback>
                </Form.Group>
                
                {/* Form Buttons */}
                <div className="d-flex justify-content-end mt-4">
                  <Link to="/news" className="btn btn-outline-secondary me-2">
                    Cancel
                  </Link>
                  <Button 
                    type="submit" 
                    disabled={isSubmitting}
                    variant="primary"
                  >
                    {isSubmitting ? (
                      <>
                        <Spinner
                          as="span"
                          animation="border"
                          size="sm"
                          role="status"
                          aria-hidden="true"
                          className="me-2"
                        />
                        Saving...
                      </>
                    ) : (
                      isEditing ? 'Update News' : 'Create News'
                    )}
                  </Button>
                </div>
              </Form>
            )}
          </Formik>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default NewsForm;
