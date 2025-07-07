import React, { useState } from 'react';
import { Formik, Form, Field } from 'formik';
import * as Yup from 'yup';
import { Container, Row, Col, Card, Button, Alert } from 'react-bootstrap';
import { useAuth } from '../../components/auth/AuthContext';

const ChangePasswordSchema = Yup.object().shape({
  currentPassword: Yup.string()
    .required('Current password is required'),
  newPassword: Yup.string()
    .required('New password is required')
    .min(8, 'Password must be at least 8 characters')
    .matches(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
  confirmPassword: Yup.string()
    .required('Please confirm your new password')
    .oneOf([Yup.ref('newPassword')], 'Passwords must match')
});

const ChangePassword = () => {
  const { changePassword } = useAuth();
  const [status, setStatus] = useState({ type: '', message: '' });

  const handleSubmit = async (values, { setSubmitting, resetForm }) => {
    try {
      const success = await changePassword(values.currentPassword, values.newPassword);
      if (success) {
        setStatus({
          type: 'success',
          message: 'Password changed successfully'
        });
        resetForm();
      }
    } catch (err) {
      setStatus({
        type: 'danger',
        message: 'Failed to change password. Please try again.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container className="py-5">
      <Row className="justify-content-center">
        <Col md={6} lg={5}>
          <Card className="shadow-sm">
            <Card.Body className="p-4">
              <h2 className="text-center mb-4">Change Password</h2>

              {status.message && (
                <Alert variant={status.type} className="mb-4">
                  {status.message}
                </Alert>
              )}

              <Formik
                initialValues={{
                  currentPassword: '',
                  newPassword: '',
                  confirmPassword: ''
                }}
                validationSchema={ChangePasswordSchema}
                onSubmit={handleSubmit}
              >
                {({ errors, touched, isSubmitting }) => (
                  <Form>
                    <div className="mb-3">
                      <Field
                        type="password"
                        name="currentPassword"
                        placeholder="Current Password"
                        className={`form-control ${
                          errors.currentPassword && touched.currentPassword ? 'is-invalid' : ''
                        }`}
                      />
                      {errors.currentPassword && touched.currentPassword && (
                        <div className="invalid-feedback">{errors.currentPassword}</div>
                      )}
                    </div>

                    <div className="mb-3">
                      <Field
                        type="password"
                        name="newPassword"
                        placeholder="New Password"
                        className={`form-control ${
                          errors.newPassword && touched.newPassword ? 'is-invalid' : ''
                        }`}
                      />
                      {errors.newPassword && touched.newPassword && (
                        <div className="invalid-feedback">{errors.newPassword}</div>
                      )}
                    </div>

                    <div className="mb-4">
                      <Field
                        type="password"
                        name="confirmPassword"
                        placeholder="Confirm New Password"
                        className={`form-control ${
                          errors.confirmPassword && touched.confirmPassword ? 'is-invalid' : ''
                        }`}
                      />
                      {errors.confirmPassword && touched.confirmPassword && (
                        <div className="invalid-feedback">{errors.confirmPassword}</div>
                      )}
                    </div>

                    <Button
                      type="submit"
                      variant="primary"
                      className="w-100"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Changing Password...' : 'Change Password'}
                    </Button>
                  </Form>
                )}
              </Formik>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default ChangePassword;
