import React, { useState } from 'react';
import { Modal, Button, Form, Alert, Spinner, ProgressBar } from 'react-bootstrap';
import { FaTrash, FaExclamationTriangle } from 'react-icons/fa';
import { bulkOperationsAPI } from '../services/api';
import { toast } from 'react-toastify';

const DeleteAllChannelsModal = ({ show, onHide, onDeleteSuccess, totalChannels = 0 }) => {
  const [confirmationText, setConfirmationText] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [isConfirmed, setIsConfirmed] = useState(false);

  const CONFIRMATION_TEXT = 'DELETE ALL CHANNELS';

  // Handle confirmation text input
  const handleConfirmationChange = (e) => {
    const value = e.target.value;
    setConfirmationText(value);
    setIsConfirmed(value === CONFIRMATION_TEXT);
  };

  // Handle modal close
  const handleClose = () => {
    if (!loading) {
      setConfirmationText('');
      setIsConfirmed(false);
      setProgress(null);
      onHide();
    }
  };

  // Handle delete all channels
  const handleDeleteAll = async () => {
    if (!isConfirmed) {
      toast.error('Please type the confirmation text exactly as shown');
      return;
    }

    setLoading(true);
    setProgress({ message: 'Stopping active transcoding processes...', step: 1, total: 4 });

    try {
      const response = await bulkOperationsAPI.deleteAllChannels();
      
      if (response.data.success) {
        const { deleted, stopped, errors } = response.data.data;
        
        // Show success message
        let message = `Successfully deleted ${deleted} channels`;
        if (stopped > 0) {
          message += ` and stopped ${stopped} transcoding processes`;
        }
        
        toast.success(message, { autoClose: 5000 });
        
        // Show warnings if any
        if (errors.length > 0) {
          errors.forEach(error => {
            toast.warning(error, { autoClose: 8000 });
          });
        }
        
        onDeleteSuccess?.({ deleted, stopped, errors });
        handleClose();
      } else {
        toast.error('Failed to delete channels');
      }
    } catch (error) {
      console.error('Error deleting all channels:', error);
      toast.error('Error occurred while deleting channels');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  return (
    <Modal show={show} onHide={handleClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title className="text-danger">
          <FaExclamationTriangle className="me-2" />
          Delete All Channels
        </Modal.Title>
      </Modal.Header>
      
      <Modal.Body>
        {loading ? (
          <div className="text-center py-4">
            <Spinner animation="border" variant="danger" className="mb-3" />
            <h5>Deleting All Channels...</h5>
            {progress && (
              <div className="mt-3">
                <p className="text-muted">{progress.message}</p>
                <ProgressBar 
                  now={(progress.step / progress.total) * 100} 
                  label={`Step ${progress.step} of ${progress.total}`}
                  variant="danger"
                />
              </div>
            )}
          </div>
        ) : (
          <div>
            <Alert variant="danger" className="mb-4">
              <FaExclamationTriangle className="me-2" />
              <strong>⚠️ DANGEROUS OPERATION</strong>
              <br />
              This action will permanently delete <strong>ALL {totalChannels} channels</strong> and cannot be undone.
            </Alert>

            <div className="mb-4">
              <h6>What will happen:</h6>
              <ul className="text-muted">
                <li>🛑 All active transcoding processes will be stopped</li>
                <li>🗑️ All transcoded files and directories will be removed</li>
                <li>🖼️ All uploaded channel logos will be deleted</li>
                <li>📊 All channel database entries will be permanently deleted</li>
                <li>🔧 All related transcoding jobs will be cleaned up</li>
              </ul>
            </div>

            <div className="mb-4">
              <h6>⚠️ Important Notes:</h6>
              <ul className="text-danger small">
                <li>This operation cannot be undone</li>
                <li>All channel data will be lost permanently</li>
                <li>Active streams will be interrupted</li>
                <li>The system will need to be reconfigured after deletion</li>
              </ul>
            </div>

            <div className="border p-3 bg-light rounded">
              <Form.Group>
                <Form.Label className="fw-bold">
                  To confirm deletion, type: <code className="text-danger">{CONFIRMATION_TEXT}</code>
                </Form.Label>
                <Form.Control
                  type="text"
                  value={confirmationText}
                  onChange={handleConfirmationChange}
                  placeholder="Type the confirmation text here"
                  className={isConfirmed ? 'border-success' : 'border-danger'}
                />
                <Form.Text className="text-muted">
                  Type exactly: {CONFIRMATION_TEXT}
                </Form.Text>
              </Form.Group>
            </div>

            {totalChannels === 0 && (
              <Alert variant="info" className="mt-3">
                <strong>No channels to delete.</strong>
                <br />
                There are currently no channels in the system.
              </Alert>
            )}
          </div>
        )}
      </Modal.Body>
      
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        
        {!loading && totalChannels > 0 && (
          <Button 
            variant="danger" 
            onClick={handleDeleteAll}
            disabled={!isConfirmed}
          >
            <FaTrash className="me-2" />
            Delete All {totalChannels} Channels
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default DeleteAllChannelsModal;
