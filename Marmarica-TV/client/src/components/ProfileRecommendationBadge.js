import React, { useState, useEffect } from 'react';
import { Badge, Button, OverlayTrigger, Tooltip, Dropdown, Spinner } from 'react-bootstrap';
import { FaLightbulb, FaCheck, FaSync, FaCog } from 'react-icons/fa';
import { profileTemplatesAPI } from '../services/api';
import { toast } from 'react-toastify';

const ProfileRecommendationBadge = ({ 
  channelId, 
  currentProfile = null,
  onProfileApplied = null,
  showApplyButton = true,
  size = 'sm'
}) => {
  const [recommendation, setRecommendation] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);

  // Load recommendation and templates on component mount
  useEffect(() => {
    loadRecommendation();
    loadTemplates();
  }, [channelId]);

  // Load profile recommendation
  const loadRecommendation = async () => {
    try {
      const response = await profileTemplatesAPI.getChannelRecommendations(channelId);
      setRecommendation(response.data.data);
      setError(null);
    } catch (error) {
      console.error('Error loading recommendation:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Load all templates
  const loadTemplates = async () => {
    try {
      const response = await profileTemplatesAPI.getAllTemplates();
      setTemplates(response.data.data);
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  };

  // Apply recommended profile
  const applyRecommendedProfile = async () => {
    if (!recommendation || !recommendation.templateId) return;
    
    try {
      setApplying(true);
      
      const response = await profileTemplatesAPI.applyTemplateToChannel(
        channelId,
        recommendation.templateId,
        false
      );
      
      toast.success(response.data.message || 'Profile applied successfully');
      
      // Refresh recommendation
      await loadRecommendation();
      
      // Notify parent component
      if (onProfileApplied) {
        onProfileApplied(recommendation.templateId, recommendation.templateName);
      }
    } catch (error) {
      console.error('Error applying profile:', error);
      toast.error(error.response?.data?.error || 'Failed to apply profile');
    } finally {
      setApplying(false);
    }
  };

  // Apply alternative profile
  const applyAlternativeProfile = async (templateId, templateName) => {
    try {
      setApplying(true);
      
      const response = await profileTemplatesAPI.applyTemplateToChannel(
        channelId,
        templateId,
        false
      );
      
      toast.success(response.data.message || 'Profile applied successfully');
      
      // Refresh recommendation
      await loadRecommendation();
      
      // Notify parent component
      if (onProfileApplied) {
        onProfileApplied(templateId, templateName);
      }
    } catch (error) {
      console.error('Error applying alternative profile:', error);
      toast.error(error.response?.data?.error || 'Failed to apply profile');
    } finally {
      setApplying(false);
    }
  };

  // Generate new recommendation
  const generateNewRecommendation = async () => {
    try {
      setLoading(true);
      const response = await profileTemplatesAPI.generateRecommendation(channelId);
      setRecommendation(response.data.data);
      toast.success('New recommendation generated');
    } catch (error) {
      console.error('Error generating recommendation:', error);
      toast.error('Failed to generate new recommendation');
    } finally {
      setLoading(false);
    }
  };

  // Get confidence color
  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.8) return 'success';
    if (confidence >= 0.6) return 'warning';
    if (confidence >= 0.4) return 'info';
    return 'secondary';
  };

  // Check if current profile matches recommendation
  const isCurrentProfileRecommended = () => {
    if (!recommendation || !currentProfile) return false;
    return recommendation.templateName === currentProfile;
  };

  // Format confidence percentage
  const formatConfidence = (confidence) => {
    return Math.round(confidence * 100);
  };

  if (loading) {
    return (
      <Badge bg="secondary" className="d-flex align-items-center gap-1">
        <Spinner animation="border" size="sm" />
        <span>Loading...</span>
      </Badge>
    );
  }

  if (error || !recommendation) {
    return (
      <Badge bg="danger" className="d-flex align-items-center gap-1">
        <FaLightbulb />
        <span>No recommendation</span>
      </Badge>
    );
  }

  const isRecommendedApplied = isCurrentProfileRecommended();
  const confidenceColor = getConfidenceColor(recommendation.confidence);

  // Build tooltip content
  const tooltipContent = (
    <div>
      <div><strong>Recommended:</strong> {recommendation.templateName}</div>
      <div><strong>Confidence:</strong> {formatConfidence(recommendation.confidence)}%</div>
      <div><strong>Reason:</strong> {recommendation.reason}</div>
      {currentProfile && (
        <div><strong>Current:</strong> {currentProfile}</div>
      )}
      {recommendation.alternativeTemplates && recommendation.alternativeTemplates.length > 0 && (
        <div className="mt-2">
          <strong>Alternatives:</strong>
          <ul className="mb-0 ps-3">
            {recommendation.alternativeTemplates.slice(0, 2).map((alt, index) => (
              <li key={index}>
                {alt.templateName} ({formatConfidence(alt.confidence)}%)
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <div className="d-flex align-items-center gap-2">
      <OverlayTrigger
        placement="top"
        overlay={<Tooltip>{tooltipContent}</Tooltip>}
      >
        <Badge 
          bg={isRecommendedApplied ? 'success' : confidenceColor}
          className={`d-flex align-items-center gap-1 ${size === 'lg' ? 'p-2' : 'p-1'}`}
        >
          {isRecommendedApplied ? <FaCheck size={12} /> : <FaLightbulb size={12} />}
          <span>
            {isRecommendedApplied ? 'Applied' : recommendation.templateName}
          </span>
          <span className="ms-1">({formatConfidence(recommendation.confidence)}%)</span>
        </Badge>
      </OverlayTrigger>
      
      {showApplyButton && !isRecommendedApplied && (
        <Dropdown>
          <Dropdown.Toggle
            variant="outline-primary"
            size="sm"
            disabled={applying}
          >
            {applying ? <Spinner animation="border" size="sm" /> : 'Apply'}
          </Dropdown.Toggle>
          
          <Dropdown.Menu>
            <Dropdown.Item
              onClick={applyRecommendedProfile}
              disabled={applying}
            >
              <FaCheck className="me-2" />
              Apply {recommendation.templateName}
              <Badge bg={confidenceColor} className="ms-2">
                {formatConfidence(recommendation.confidence)}%
              </Badge>
            </Dropdown.Item>
            
            {recommendation.alternativeTemplates && recommendation.alternativeTemplates.length > 0 && (
              <>
                <Dropdown.Divider />
                <Dropdown.Header>Alternatives</Dropdown.Header>
                {recommendation.alternativeTemplates.map((alt, index) => (
                  <Dropdown.Item
                    key={index}
                    onClick={() => applyAlternativeProfile(alt.templateId, alt.templateName)}
                    disabled={applying}
                  >
                    {alt.templateName}
                    <Badge bg={getConfidenceColor(alt.confidence)} className="ms-2">
                      {formatConfidence(alt.confidence)}%
                    </Badge>
                  </Dropdown.Item>
                ))}
              </>
            )}
            
            <Dropdown.Divider />
            <Dropdown.Item onClick={generateNewRecommendation}>
              <FaSync className="me-2" />
              Generate New
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      )}
    </div>
  );
};

export default ProfileRecommendationBadge;
