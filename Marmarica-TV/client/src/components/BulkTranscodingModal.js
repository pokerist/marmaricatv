import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Alert, Table, Badge, ProgressBar, Spinner } from 'react-bootstrap';
import { FaPlay, FaCheck, FaTimes } from 'react-icons/fa';
import { bulkOperationsAPI, transcodingProfilesAPI } from '../services/api';
import { toast } from 'react-toastify';

const BulkTranscodingModal = ({ show, onHide, onTranscodingSuccess }) => {
  const [eligibleChannels, setEligibleChannels] = useState([]);
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [loading, setLoading] = useState(false);
  const [transcoding, setTranscoding] = useState(false);
  const [transcodingProgress, setTranscodingProgress] = useState(null);

  // Load eligible channels and profiles when modal opens
  useEffect(() => {
    if (show) {
      loadEligibleChannels();
      loadProfiles();
    }
  }, [show]);

  // Load channels that can be transcoded
  const loadEligibleChannels = async () => {
    try {
      setLoading(true);
      const response = await bulkOperationsAPI.getTranscodingEligibleChannels();
      
      if (response.data.success) {
        setEligibleChannels(response.data.data);
        setSelectedChannels([]); // Reset selection
      } else {
        toast.error('Failed to load eligible channels');
      }
    } catch (error) {
      console.error('Error loading eligible channels:', error);
      toast.error('Error loading channels');
    } finally {
      setLoading(false);
    }
  };

  // Load transcoding profiles
  const loadProfiles = async () => {
    try {
      const response = await transcodingProfilesAPI.getAllProfiles();
      setProfiles(response.data.data);
      
      // Set default profile as selected
      const defaultProfile = response.data.data.find(p => p.is_default);
      if (defaultProfile) {
        setSelectedProfile(defaultProfile.id.toString());
      }
    } catch (error) {
      console.error('Error loading profiles:', error);
      toast.error('Failed to load transcoding profiles');
    }
  };

  // Handle modal close
  const handleClose = () => {
    if (!transcoding) {
      setSelectedChannels([]);
      setTranscodingProgress(null);
      onHide();
    }
  };

  // Handle select all checkbox
  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedChannels(eligibleChannels.map(channel => channel.id));
    } else {
      setSelectedChannels([]);
    }
  };

  // Handle individual channel selection
  const handleChannelSelect = (channelId, checked) => {
    if (checked) {
      setSelectedChannels(prev => [...prev, channelId]);
    } else {
      setSelectedChannels(prev => prev.filter(id => id !== channelId));
    }
  };

  // Start bulk transcoding
  const handleStartTranscoding = async () => {
    if (selectedChannels.length === 0) {
      toast.error('Please select at least one channel');
      return;
    }

    if (!selectedProfile) {
      toast.error('Please select a transcoding profile');
      return;
    }

    try {
      setTranscoding(true);
      setTranscodingProgress({ current: 0, total: selectedChannels.length });

      const response = await bulkOperationsAPI.startBulkTranscoding(selectedChannels, selectedProfile);
      
      if (response.data.success) {
        const results = response.data.data;
        toast.success(`Successfully started transcoding for ${results.processed} channels`);
        
        if (results.failed > 0) {
          toast.warning(`${results.failed} channels failed to start transcoding`);
        }
        
        onTranscodingSuccess?.(results);
        handleClose();
      } else {
        toast.error('Failed to start bulk transcoding');
      }
    } catch (error) {
      console.error('Error starting bulk transcoding:', error);
      toast.error('Error starting bulk transcoding');
    } finally {
      setTranscoding(false);
      setTranscodingProgress(null);
    }
  };

  // Start transcoding for all channels
  const handleTranscodeAll = async () => {
    if (eligibleChannels.length === 0) {
      toast.error('No channels available for transcoding');
      return;
    }

    if (!selectedProfile) {
      toast.error('Please select a transcoding profile');
      return;
    }

    try {
      setTranscoding(true);
      setTranscodingProgress({ current: 0, total: eligibleChannels.length });

      const response = await bulkOperationsAPI.startBulkTranscoding(null, selectedProfile);
      
      if (response.data.success) {
        const results = response.data.data;
        toast.success(`Successfully started transcoding for ${results.processed} channels`);
        
        if (results.failed > 0) {
          toast.warning(`${results.failed} channels failed to start transcoding`);
        }
        
        onTranscodingSuccess?.(results);
        handleClose();
      } else {
        toast.error('Failed to start bulk transcoding');
      }
    } catch (error) {
      console.error('Error starting bulk transcoding:', error);
      toast.error('Error starting bulk transcoding');
    } finally {
      setTranscoding(false);
      setTranscodingProgress(null);
    }
  };

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
    <Modal show={show} onHide={handleClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          <FaPlay className="me-2" />
          Bulk Transcoding
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading ? (
          <div className="text-center py-4">
            <Spinner animation="border" variant="primary" className="mb-3" />
            <h5>Loading eligible channels...</h5>
          </div>
        ) : transcoding ? (
          <div className="text-center py-4">
            <Spinner animation="border" variant="primary" className="mb-3" />
            <h5>Starting transcoding...</h5>
            {transcodingProgress && (
              <div className="mt-3">
                <ProgressBar 
                  now={(transcodingProgress.current / transcodingProgress.total) * 100} 
                  label={`${transcodingProgress.current}/${transcodingProgress.total}`}
                />
              </div>
            )}
          </div>
        ) : (
          <div>
            {eligibleChannels.length === 0 ? (
              <Alert variant="info">
                <strong>No channels available for transcoding.</strong>
                <br />
                All channels either already have transcoding enabled or there are no channels in the system.
              </Alert>
            ) : (
              <>
                <Alert variant="info" className="mb-3">
                  <strong>Bulk Transcoding</strong>
                  <br />
                  Select channels to enable transcoding for multiple channels at once. 
                  This will convert MPEG-TS streams to HLS format for better web compatibility.
                </Alert>

                {/* Profile Selection */}
                <div className="mb-3">
                  <Form.Label>Transcoding Profile</Form.Label>
                  <Form.Select
                    value={selectedProfile}
                    onChange={(e) => setSelectedProfile(e.target.value)}
                  >
                    <option value="">Select a profile...</option>
                    {profiles.map(profile => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                        {profile.is_default && ' (Default)'}
                        {profile.description && ` - ${profile.description}`}
                      </option>
                    ))}
                  </Form.Select>
                  <Form.Text className="text-muted">
                    The selected profile will be applied to all channels during transcoding.
                  </Form.Text>
                </div>

                <div className="mb-3">
                  <Form.Check
                    type="checkbox"
                    label={`Select All (${eligibleChannels.length} channels)`}
                    checked={selectedChannels.length === eligibleChannels.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="fw-bold"
                  />
                </div>

                <div className="table-responsive" style={{ maxHeight: '400px' }}>
                  <Table striped bordered hover size="sm">
                    <thead className="sticky-top bg-light">
                      <tr>
                        <th style={{ width: '50px' }}>Select</th>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Category</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eligibleChannels.map((channel) => (
                        <tr key={channel.id}>
                          <td>
                            <Form.Check
                              type="checkbox"
                              checked={selectedChannels.includes(channel.id)}
                              onChange={(e) => handleChannelSelect(channel.id, e.target.checked)}
                            />
                          </td>
                          <td>{channel.name}</td>
                          <td>{renderTypeBadge(channel.type)}</td>
                          <td>{channel.category}</td>
                          <td>
                            <Badge bg="secondary">
                              Transcoding Disabled
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>

                <div className="mt-3">
                  <small className="text-muted">
                    Selected: {selectedChannels.length} of {eligibleChannels.length} channels
                  </small>
                </div>
              </>
            )}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose} disabled={transcoding}>
          Cancel
        </Button>
        
        {!loading && !transcoding && eligibleChannels.length > 0 && (
          <>
            <Button 
              variant="warning" 
              onClick={handleTranscodeAll}
              disabled={eligibleChannels.length === 0}
            >
              <FaPlay className="me-2" />
              Transcode All ({eligibleChannels.length})
            </Button>
            
            <Button 
              variant="primary" 
              onClick={handleStartTranscoding}
              disabled={selectedChannels.length === 0}
            >
              <FaCheck className="me-2" />
              Start Transcoding ({selectedChannels.length})
            </Button>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default BulkTranscodingModal;
