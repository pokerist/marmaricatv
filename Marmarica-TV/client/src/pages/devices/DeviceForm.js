import React, { useState, useEffect } from 'react';
import { Container, Card, Row, Col, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Formik } from 'formik';
import * as Yup from 'yup';
import { devicesAPI } from '../../services/api';
import { toast } from 'react-toastify';

// Validation schema
const DeviceSchema = Yup.object().shape({
  owner_name: Yup.string()
    .required('Owner name is required')
    .min(3, 'Owner name must be at least 3 characters'),
  allowed_types: Yup.array()
    .min(1, 'At least one type must be selected'),
  expiry_date: Yup.date()
    .when('isEditing', {
      is: true,
      then: () => Yup.date().required('Expiry date is required')
    }),
  status: Yup.string()
    .when('isEditing', {
      is: true,
      then: () => Yup.string().required('Status is required')
    })
});

const DeviceForm = () => {
  const { id } = useParams(); // Get ID from URL if editing
  const navigate = useNavigate();
  const isEditing = !!id;
  
  const [loading, setLoading] = useState(isEditing);
  const [device, setDevice] = useState(null);
  const [error, setError] = useState('');
  
  // Load device data if editing
  useEffect(() => {
    if (isEditing) {
      const fetchDevice = async () => {
        try {
          setLoading(true);
          const response = await devicesAPI.getDeviceById(id);
          setDevice(response.data.data);
        } catch (error) {
          console.error('Error fetching device:', error);
          setError('Failed to load device data. Please try again.');
          toast.error('Could not load device data');
        } finally {
          setLoading(false);
        }
      };
      
      fetchDevice();
    }
  }, [id, isEditing]);
  
  // Handle form submission
  const handleSubmit = async (values, { setSubmitting, resetForm }) => {
    try {
      setSubmitting(true);
      
      // Process allowed types from array to comma-separated string
      const formattedValues = {
        ...values,
        allowed_types: values.allowed_types.join(',')
      };
      
      if (isEditing) {
        // Update existing device
        await devicesAPI.updateDevice(id, formattedValues);
        toast.success('Device updated successfully');
      } else {
        // Create new device
        await devicesAPI.createDevice(formattedValues);
        toast.success('Device created successfully');
        resetForm();
      }
      
      if (isEditing) {
        // Redirect to devices list after edit
        navigate('/devices');
      }
    } catch (error) {
      console.error('Error saving device:', error);
      toast.error('Failed to save device data');
    } finally {
      setSubmitting(false);
    }
  };
  
  // Prepare initial values for the form
  const getInitialValues = () => {
    if (isEditing && device) {
      // For editing mode, convert comma-separated allowed types to array
      return {
        owner_name: device.owner_name || '',
        allowed_types: device.allowed_types ? device.allowed_types.split(',') : ['FTA', 'Local'],
        expiry_date: device.expiry_date || '',
        status: device.status || 'disabled',
        isEditing: true
      };
    }
    
    // Default values for new device
    return {
      owner_name: '',
      allowed_types: ['FTA', 'Local'],
      isEditing: false
    };
  };
  
  // Show loader while fetching device data
  if (isEditing && loading) {
    return (
      <Container className="py-5 text-center">
        <Spinner animation="border" role="status" className="mb-3">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
        <p>Loading device data...</p>
      </Container>
    );
  }
  
  // Show error if failed to load device
  if (isEditing && error && !device) {
    return (
      <Container className="py-5">
        <Alert variant="danger">
          {error}
          <div className="mt-3">
            <Link to="/devices" className="btn btn-primary">Back to Devices</Link>
          </div>
        </Alert>
      </Container>
    );
  }

  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-center">
        <h1 className="page-title">{isEditing ? 'Edit Device' : 'Add New Device'}</h1>
        <Link to="/devices" className="btn btn-outline-secondary">
          Back to Devices List
        </Link>
      </div>
      
      <Card className="form-container">
        <Card.Body>
          <Formik
            initialValues={getInitialValues()}
            validationSchema={DeviceSchema}
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
                  {/* Owner Name */}
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Owner Name</Form.Label>
                      <Form.Control
                        type="text"
                        name="owner_name"
                        value={values.owner_name}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        isInvalid={touched.owner_name && errors.owner_name}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.owner_name}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  
                  {/* Allowed Types */}
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Allowed Types</Form.Label>
                      <div>
                        <Form.Check
                          inline
                          type="checkbox"
                          id="type-fta"
                          label="FTA"
                          checked={values.allowed_types.includes('FTA')}
                          onChange={() => {
                            const newTypes = values.allowed_types.includes('FTA')
                              ? values.allowed_types.filter(t => t !== 'FTA')
                              : [...values.allowed_types, 'FTA'];
                            setFieldValue('allowed_types', newTypes);
                          }}
                        />
                        <Form.Check
                          inline
                          type="checkbox"
                          id="type-local"
                          label="Local"
                          checked={values.allowed_types.includes('Local')}
                          onChange={() => {
                            const newTypes = values.allowed_types.includes('Local')
                              ? values.allowed_types.filter(t => t !== 'Local')
                              : [...values.allowed_types, 'Local'];
                            setFieldValue('allowed_types', newTypes);
                          }}
                        />
                        <Form.Check
                          inline
                          type="checkbox"
                          id="type-bein"
                          label="BeIN"
                          checked={values.allowed_types.includes('BeIN')}
                          onChange={() => {
                            const newTypes = values.allowed_types.includes('BeIN')
                              ? values.allowed_types.filter(t => t !== 'BeIN')
                              : [...values.allowed_types, 'BeIN'];
                            setFieldValue('allowed_types', newTypes);
                          }}
                        />
                      </div>
                      {touched.allowed_types && errors.allowed_types && (
                        <div className="text-danger small mt-1">
                          {errors.allowed_types}
                        </div>
                      )}
                    </Form.Group>
                  </Col>
                </Row>
                
                {/* These fields are only shown when editing */}
                {isEditing && (
                  <Row>
                    {/* Expiry Date */}
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Expiry Date</Form.Label>
                        <Form.Control
                          type="date"
                          name="expiry_date"
                          value={values.expiry_date}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          isInvalid={touched.expiry_date && errors.expiry_date}
                        />
                        <Form.Control.Feedback type="invalid">
                          {errors.expiry_date}
                        </Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    
                    {/* Status */}
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Status</Form.Label>
                        <Form.Select
                          name="status"
                          value={values.status}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          isInvalid={touched.status && errors.status}
                        >
                          <option value="active">Active</option>
                          <option value="disabled">Disabled</option>
                          <option value="expired">Expired</option>
                        </Form.Select>
                        <Form.Control.Feedback type="invalid">
                          {errors.status}
                        </Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                  </Row>
                )}
                
                {/* DUID and Activation Code (read-only, only when editing) */}
                {isEditing && device && (
                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>DUID (Read-only)</Form.Label>
                        <Form.Control
                          type="text"
                          value={device.duid}
                          readOnly
                          disabled
                        />
                        <Form.Text className="text-muted">
                          Device Unique Identifier cannot be changed
                        </Form.Text>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Activation Code (Read-only)</Form.Label>
                        <Form.Control
                          type="text"
                          value={device.activation_code}
                          readOnly
                          disabled
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                )}
                
                {/* Form Buttons */}
                <div className="d-flex justify-content-end mt-4">
                  <Link to="/devices" className="btn btn-outline-secondary me-2">
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
                      isEditing ? 'Update Device' : 'Create Device'
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

export default DeviceForm;
