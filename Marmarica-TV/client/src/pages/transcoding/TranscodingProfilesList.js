import React, { useState, useEffect } from 'react';
import { 
  Container, Card, Table, Button, Badge, 
  Dropdown, DropdownButton, Alert, Spinner 
} from 'react-bootstrap';
import { FaPlus, FaEdit, FaTrash, FaStar, FaRegStar, FaCog } from 'react-icons/fa';
import { transcodingProfilesAPI } from '../../services/api';
import { toast } from 'react-toastify';
import TranscodingProfileModal from '../../components/TranscodingProfileModal';

const TranscodingProfilesList = () => {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [actionLoading, setActionLoading] = useState(new Set());

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    try {
      setLoading(true);
      const response = await transcodingProfilesAPI.getAllProfiles();
      setProfiles(response.data.data);
    } catch (error) {
      console.error('Error fetching profiles:', error);
      toast.error('Failed to load transcoding profiles');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProfile = () => {
    setSelectedProfile(null);
    setShowModal(true);
  };

  const handleEditProfile = (profile) => {
    setSelectedProfile(profile);
    setShowModal(true);
  };

  const handleDeleteProfile = async (profile) => {
    if (profile.is_default) {
      toast.error('Cannot delete the default profile');
      return;
    }

    if (window.confirm(`Are you sure you want to delete the profile "${profile.name}"?`)) {
      setActionLoading(prev => new Set(prev).add(profile.id));
      try {
        await transcodingProfilesAPI.deleteProfile(profile.id);
        toast.success('Profile deleted successfully');
        fetchProfiles();
      } catch (error) {
        console.error('Error deleting profile:', error);
        toast.error('Failed to delete profile');
      } finally {
        setActionLoading(prev => {
          const newSet = new Set(prev);
          newSet.delete(profile.id);
          return newSet;
        });
      }
    }
  };

  const handleSetDefault = async (profile) => {
    if (profile.is_default) {
      return; // Already default
    }

    setActionLoading(prev => new Set(prev).add(profile.id));
    try {
      await transcodingProfilesAPI.setDefaultProfile(profile.id);
      toast.success(`"${profile.name}" set as default profile`);
      fetchProfiles();
    } catch (error) {
      console.error('Error setting default profile:', error);
      toast.error('Failed to set default profile');
    } finally {
      setActionLoading(prev => {
        const newSet = new Set(prev);
        newSet.delete(profile.id);
        return newSet;
      });
    }
  };

  const handleModalSuccess = () => {
    fetchProfiles();
  };

  const renderProfileBadges = (profile) => {
    const badges = [];
    
    if (profile.is_default) {
      badges.push(
        <Badge key="default" bg="success" className="me-2">
          <FaStar className="me-1" />
          Default
        </Badge>
      );
    }
    
    // Quality indicator based on preset
    const qualityMap = {
      'ultrafast': { color: 'danger', text: 'Ultra Fast' },
      'superfast': { color: 'danger', text: 'Super Fast' },
      'veryfast': { color: 'warning', text: 'Very Fast' },
      'faster': { color: 'warning', text: 'Faster' },
      'fast': { color: 'info', text: 'Fast' },
      'medium': { color: 'primary', text: 'Medium' },
      'slow': { color: 'secondary', text: 'Slow' },
      'slower': { color: 'secondary', text: 'Slower' },
      'veryslow': { color: 'dark', text: 'Very Slow' }
    };
    
    const quality = qualityMap[profile.preset] || { color: 'secondary', text: profile.preset };
    badges.push(
      <Badge key="quality" bg={quality.color} className="me-2">
        {quality.text}
      </Badge>
    );
    
    return badges;
  };

  const renderProfileDetails = (profile) => {
    return (
      <div className="small text-muted">
        <div>
          <strong>Video:</strong> {profile.video_codec} @ {profile.video_bitrate} | 
          <strong> Audio:</strong> {profile.audio_codec} @ {profile.audio_bitrate}
        </div>
        <div>
          <strong>Resolution:</strong> {profile.resolution} | 
          <strong> GOP:</strong> {profile.gop_size} | 
          <strong> HLS:</strong> {profile.hls_time}s segments
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <Container fluid>
        <div className="text-center py-5">
          <Spinner animation="border" variant="primary" />
          <p className="mt-2">Loading transcoding profiles...</p>
        </div>
      </Container>
    );
  }

  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title">Transcoding Profiles</h1>
        <Button variant="primary" onClick={handleCreateProfile}>
          <FaPlus className="me-2" />
          Create Profile
        </Button>
      </div>

      {profiles.length === 0 ? (
        <Alert variant="info" className="text-center">
          <FaCog className="me-2" />
          No transcoding profiles found. Create your first profile to get started.
        </Alert>
      ) : (
        <Card>
          <Card.Body className="px-0">
            <Table hover responsive className="mb-0">
              <thead>
                <tr>
                  <th>Profile Name</th>
                  <th>Description</th>
                  <th>Settings</th>
                  <th>Status</th>
                  <th style={{ width: '150px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => (
                  <tr key={profile.id}>
                    <td>
                      <div className="d-flex align-items-center">
                        <strong>{profile.name}</strong>
                        {profile.is_default && (
                          <FaStar className="text-warning ms-2" title="Default Profile" />
                        )}
                      </div>
                    </td>
                    <td>
                      <div>
                        {profile.description || (
                          <em className="text-muted">No description</em>
                        )}
                      </div>
                      {renderProfileDetails(profile)}
                    </td>
                    <td>
                      {renderProfileBadges(profile)}
                    </td>
                    <td>
                      <Badge bg="secondary">
                        Created {new Date(profile.created_at).toLocaleDateString()}
                      </Badge>
                    </td>
                    <td>
                      <div className="d-flex gap-2">
                        <Button
                          variant="outline-primary"
                          size="sm"
                          onClick={() => handleEditProfile(profile)}
                          disabled={actionLoading.has(profile.id)}
                        >
                          <FaEdit />
                        </Button>
                        
                        <DropdownButton
                          id={`profile-actions-${profile.id}`}
                          variant="outline-secondary"
                          size="sm"
                          title="⋮"
                          disabled={actionLoading.has(profile.id)}
                        >
                          {!profile.is_default && (
                            <Dropdown.Item onClick={() => handleSetDefault(profile)}>
                              <FaRegStar className="me-2" />
                              Set as Default
                            </Dropdown.Item>
                          )}
                          
                          {!profile.is_default && (
                            <>
                              <Dropdown.Divider />
                              <Dropdown.Item 
                                onClick={() => handleDeleteProfile(profile)}
                                className="text-danger"
                              >
                                <FaTrash className="me-2" />
                                Delete Profile
                              </Dropdown.Item>
                            </>
                          )}
                          
                          {profile.is_default && (
                            <Dropdown.Item disabled>
                              <FaTrash className="me-2" />
                              Cannot delete default profile
                            </Dropdown.Item>
                          )}
                        </DropdownButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      )}

      <Card className="mt-4">
        <Card.Header>
          <h5 className="mb-0">💡 Profile Guidelines</h5>
        </Card.Header>
        <Card.Body>
          <div className="row">
            <div className="col-md-4">
              <h6>⚡ Fast Profiles</h6>
              <ul className="small">
                <li>Use <code>ultrafast</code> or <code>veryfast</code> preset</li>
                <li>Lower bitrates (800k-1500k video)</li>
                <li>Good for testing and low-end devices</li>
              </ul>
            </div>
            <div className="col-md-4">
              <h6>⚖️ Balanced Profiles</h6>
              <ul className="small">
                <li>Use <code>veryfast</code> or <code>fast</code> preset</li>
                <li>Medium bitrates (1500k-3000k video)</li>
                <li>Good for most production use cases</li>
              </ul>
            </div>
            <div className="col-md-4">
              <h6>💎 Quality Profiles</h6>
              <ul className="small">
                <li>Use <code>slow</code> or <code>slower</code> preset</li>
                <li>Higher bitrates (3000k+ video)</li>
                <li>Best quality but slower encoding</li>
              </ul>
            </div>
          </div>
        </Card.Body>
      </Card>

      <TranscodingProfileModal
        show={showModal}
        onHide={() => setShowModal(false)}
        profile={selectedProfile}
        onSuccess={handleModalSuccess}
      />
    </Container>
  );
};

export default TranscodingProfilesList;
