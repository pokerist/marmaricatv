import React, { useState, useEffect, useRef } from 'react';
import { Container, Card, Row, Col, Form, Button, Alert, Spinner, Image, Badge } from 'react-bootstrap';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Formik } from 'formik';
import * as Yup from 'yup';
import { channelsAPI, transcodingAPI } from '../../services/api';
import { toast } from 'react-toastify';
import { FaUpload, FaPlay, FaStop, FaSync } from 'react-icons/fa';

// Validation schema
const ChannelSchema = Yup.object().shape({
  name: Yup.string()
    .required('Channel name is required')
    .min(2, 'Channel name must be at least 2 characters'),
  url: Yup.string()
    .required('Stream URL is required'),
    //.url('Must be a valid URL format'),
  type: Yup.string()
    .required('Channel type is required'),
  category: Yup.string()
    .required('Category is required'),
  has_news: Yup.boolean(),
  transcoding_enabled: Yup.boolean()
});

const ChannelForm = () => {
  const { id } = useParams(); // Get ID from URL if editing
  const navigate = useNavigate();
  const isEditing = !!id;
  
  const [loading, setLoading] = useState(isEditing);
  const [channel, setChannel] = useState(null);
  const [error, setError] = useState('');
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  
  const fileInputRef = useRef();
  
  // Categories list
  const categories = [
    'Religious', 'News', 'Movies', 'Family', 'Sports',
    'Entertainment', 'Kids', 'Documentary', 'Music', 'General'
  ];
  
  // Load channel data if editing
  useEffect(() => {
    if (isEditing) {
      const fetchChannel = async () => {
        try {
          setLoading(true);
          const response = await channelsAPI.getChannelById(id);
          setChannel(response.data.data);
          
          // Set logo preview if exists
          if (response.data.data.logo_url) {
            setLogoPreview(`http://155.138.231.215:5000${response.data.data.logo_url}`);
          }
        } catch (error) {
          console.error('Error fetching channel:', error);
          setError('Failed to load channel data. Please try again.');
          toast.error('Could not load channel data');
        } finally {
          setLoading(false);
        }
      };
      
      fetchChannel();
    }
  }, [id, isEditing]);
  
  // Handle file selection for logo upload
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Check if file is an image
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size should be less than 5MB');
        return;
      }
      
      setLogoFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setLogoPreview(e.target.result);
      };
      reader.readAsDataURL(file);
    }
  };
  
  // Upload logo after channel is created/updated
  const uploadLogo = async (channelId) => {
    if (!logoFile) return;
    
    try {
      setUploadingLogo(true);
      await channelsAPI.uploadLogo(channelId, logoFile);
      toast.success('Logo uploaded successfully');
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error('Failed to upload logo');
    } finally {
      setUploadingLogo(false);
    }
  };
  
  // Handle form submission
  const handleSubmit = async (values, { setSubmitting, resetForm }) => {
    try {
      setSubmitting(true);
      
      // Format has_news from boolean to number
      const formattedValues = {
        ...values,
        has_news: values.has_news ? true : false
      };
      
      let response;
      
      if (isEditing) {
        // Update existing channel
        response = await channelsAPI.updateChannel(id, formattedValues);
        
        // Upload logo if selected
        if (logoFile) {
          await uploadLogo(id);
        }
        
        toast.success('Channel updated successfully');
        navigate('/channels');
      } else {
        // Create new channel
        response = await channelsAPI.createChannel(formattedValues);
        
        // Upload logo if selected
        if (logoFile) {
          await uploadLogo(response.data.data.id);
        }
        
        toast.success('Channel created successfully');
        resetForm();
        setLogoFile(null);
        setLogoPreview(null);
      }
    } catch (error) {
      console.error('Error saving channel:', error);
      toast.error('Failed to save channel');
    } finally {
      setSubmitting(false);
    }
  };
  
  // Prepare initial values for the form
  const getInitialValues = () => {
    if (isEditing && channel) {
      return {
        name: channel.name || '',
        url: channel.url || '',
        type: channel.type || 'FTA',
        category: channel.category || 'General',
        has_news: channel.has_news ? true : false,
        transcoding_enabled: channel.transcoding_enabled ? true : false
      };
    }
    
    // Default values for new channel
    return {
      name: '',
      url: '',
      type: 'FTA',
      category: 'General',
      has_news: false,
      transcoding_enabled: false
    };
  };
  
  // Show loader while fetching channel data
  if (isEditing && loading) {
    return (
      <Container className="py-5 text-center">
        <Spinner animation="border" role="status" className="mb-3">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
        <p>Loading channel data...</p>
      </Container>
    );
  }
  
  // Show error if failed to load channel
  if (isEditing && error && !channel) {
    return (
      <Container className="py-5">
        <Alert variant="danger">
          {error}
          <div className="mt-3">
            <Link to="/channels" className="btn btn-primary">Back to Channels</Link>
          </div>
        </Alert>
      </Container>
    );
  }

  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-center">
        <h1 className="page-title">{isEditing ? 'Edit Channel' : 'Add New Channel'}</h1>
        <Link to="/channels" className="btn btn-outline-secondary">
          Back to Channels List
        </Link>
      </div>
      
      <Card className="form-container">
        <Card.Body>
          <Formik
            initialValues={getInitialValues()}
            validationSchema={ChannelSchema}
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
              isSubmitting,
              setFieldValue
            }) => (
              <Form onSubmit={handleSubmit}>
                <Row>
                  {/* Channel Logo Upload */}
                  <Col md={12} className="mb-4 text-center">
                    <Form.Group>
                      <Form.Label>Channel Logo</Form.Label>
                      <div className="d-flex flex-column align-items-center">
                        {logoPreview ? (
                          <Image 
                            src={logoPreview} 
                            alt="Channel Logo Preview" 
                            roundedCircle 
                            style={{ width: '100px', height: '100px', objectFit: 'cover' }} 
                            className="mb-3 border"
                          />
                        ) : (
                          <div 
                            className="bg-light d-flex align-items-center justify-content-center mb-3 rounded-circle"
                            style={{ width: '100px', height: '100px' }}
                          >
                            <small className="text-muted">No Logo</small>
                          </div>
                        )}
                        
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileChange}
                          ref={fileInputRef}
                          style={{ display: 'none' }}
                        />
                        
                        <Button 
                          variant="outline-primary" 
                          size="sm"
                          onClick={() => fileInputRef.current.click()}
                        >
                          <FaUpload className="me-2" />
                          {logoPreview ? 'Change Logo' : 'Upload Logo'}
                        </Button>
                      </div>
                    </Form.Group>
                  </Col>
                  
                  {/* Channel Name */}
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Channel Name</Form.Label>
                      <Form.Control
                        type="text"
                        name="name"
                        value={values.name}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        isInvalid={touched.name && errors.name}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.name}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  
                  {/* Stream URL */}
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Original Stream URL</Form.Label>
                      <Form.Control
                        type="text"
                        name="url"
                        value={values.url}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        isInvalid={touched.url && errors.url}
                        placeholder="http://example.com/stream.m3u8"
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.url}
                      </Form.Control.Feedback>
                      <Form.Text className="text-muted">
                        This is the original source URL that will be transcoded
                      </Form.Text>
                    </Form.Group>
                  </Col>
                </Row>
                
                <Row>
                  {/* Channel Type */}
                  <Col md={4}>
                    <Form.Group className="mb-3">
                      <Form.Label>Channel Type</Form.Label>
                      <Form.Select
                        name="type"
                        value={values.type}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        isInvalid={touched.type && errors.type}
                      >
                        <option value="FTA">FTA</option>
                        <option value="BeIN">BeIN</option>
                        <option value="Local">Local</option>
                      </Form.Select>
                      <Form.Control.Feedback type="invalid">
                        {errors.type}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  
                  {/* Category */}
                  <Col md={4}>
                    <Form.Group className="mb-3">
                      <Form.Label>Category</Form.Label>
                      <Form.Select
                        name="category"
                        value={values.category}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        isInvalid={touched.category && errors.category}
                      >
                        {categories.map((category) => (
                          <option key={category} value={category}>{category}</option>
                        ))}
                      </Form.Select>
                      <Form.Control.Feedback type="invalid">
                        {errors.category}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  
                  {/* Has News */}
                  <Col md={4}>
                    <Form.Group className="mb-3 mt-4">
                      <Form.Check
                        type="switch"
                        id="has-news-switch"
                        name="has_news"
                        label="Channel has news content"
                        checked={values.has_news}
                        onChange={handleChange}
                      />
                    </Form.Group>
                  </Col>
                </Row>
                
                {/* Transcoding Section */}
                <Row>
                  <Col md={12}>
                    <Card className="mb-4">
                      <Card.Header>
                        <h5 className="mb-0">Transcoding Settings (LL-HLS)</h5>
                      </Card.Header>
                      <Card.Body>
                        <Row>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Check
                                type="switch"
                                id="transcoding-enabled-switch"
                                name="transcoding_enabled"
                                label="Enable LL-HLS Transcoding"
                                checked={values.transcoding_enabled}
                                onChange={handleChange}
                              />
                              <Form.Text className="text-muted">
                                When enabled, the stream will be transcoded to LL-HLS format for better compatibility and performance.
                              </Form.Text>
                            </Form.Group>
                          </Col>
                          
                          {/* Transcoding Status */}
                          {isEditing && channel && (
                            <Col md={6}>
                              <div className="mb-3">
                                <strong>Transcoding Status:</strong>
                                <div className="mt-2">
                                  {channel.transcoding_status === 'active' && (
                                    <Badge bg="success" className="me-2">
                                      <FaPlay className="me-1" />
                                      Active
                                    </Badge>
                                  )}
                                  {channel.transcoding_status === 'starting' && (
                                    <Badge bg="warning" className="me-2">
                                      <FaSync className="me-1" />
                                      Starting
                                    </Badge>
                                  )}
                                  {channel.transcoding_status === 'stopping' && (
                                    <Badge bg="warning" className="me-2">
                                      <FaStop className="me-1" />
                                      Stopping
                                    </Badge>
                                  )}
                                  {channel.transcoding_status === 'failed' && (
                                    <Badge bg="danger" className="me-2">
                                      Failed
                                    </Badge>
                                  )}
                                  {channel.transcoding_status === 'inactive' && (
                                    <Badge bg="secondary" className="me-2">
                                      Inactive
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </Col>
                          )}
                        </Row>
                        
                        {/* Transcoded URL Display */}
                        {isEditing && channel && channel.transcoded_url && (
                          <Row>
                            <Col md={12}>
                              <Form.Group className="mb-3">
                                <Form.Label>Transcoded Stream URL (Read-only)</Form.Label>
                                <Form.Control
                                  type="text"
                                  value={channel.transcoded_url}
                                  readOnly
                                  className="bg-light"
                                />
                                <Form.Text className="text-muted">
                                  This is the processed HLS stream URL that clients will use when transcoding is active
                                </Form.Text>
                              </Form.Group>
                            </Col>
                          </Row>
                        )}
                        
                        {values.transcoding_enabled && (
                          <Alert variant="info" className="mt-3">
                            <strong>Note:</strong> Transcoding will use server resources. The transcoded stream will be available at 
                            <code>[serverip]/hls_stream/channel_[ID]/output.m3u8</code> once processing begins.
                          </Alert>
                        )}
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>
                
                {/* Form Buttons */}
                <div className="d-flex justify-content-end mt-4">
                  <Link to="/channels" className="btn btn-outline-secondary me-2">
                    Cancel
                  </Link>
                  <Button 
                    type="submit" 
                    disabled={isSubmitting || uploadingLogo}
                    variant="primary"
                  >
                    {(isSubmitting || uploadingLogo) ? (
                      <>
                        <Spinner
                          as="span"
                          animation="border"
                          size="sm"
                          role="status"
                          aria-hidden="true"
                          className="me-2"
                        />
                        {uploadingLogo ? 'Uploading Logo...' : 'Saving...'}
                      </>
                    ) : (
                      isEditing ? 'Update Channel' : 'Create Channel'
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

export default ChannelForm;
