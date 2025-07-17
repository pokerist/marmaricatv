import React, { useState, useEffect } from 'react';
import { Badge, Button, OverlayTrigger, Tooltip, Spinner } from 'react-bootstrap';
import { FaCircle, FaSync, FaExclamationTriangle, FaClock, FaCheck } from 'react-icons/fa';
import { streamHealthAPI } from '../services/api';

const StreamHealthIndicator = ({ 
  channelId, 
  initialStatus = 'unknown', 
  showDetails = false, 
  onStatusChange = null,
  size = 'sm'
}) => {
  const [healthStatus, setHealthStatus] = useState(initialStatus);
  const [lastCheck, setLastCheck] = useState(null);
  const [responseTime, setResponseTime] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);

  // Status configuration
  const statusConfig = {
    available: {
      color: 'success',
      icon: FaCheck,
      label: 'Available',
      tooltip: 'Stream is healthy and available'
    },
    unavailable: {
      color: 'danger',
      icon: FaExclamationTriangle,
      label: 'Unavailable',
      tooltip: 'Stream is not available'
    },
    timeout: {
      color: 'warning',
      icon: FaClock,
      label: 'Timeout',
      tooltip: 'Stream check timed out'
    },
    error: {
      color: 'danger',
      icon: FaExclamationTriangle,
      label: 'Error',
      tooltip: 'Error checking stream health'
    },
    unknown: {
      color: 'secondary',
      icon: FaCircle,
      label: 'Unknown',
      tooltip: 'Stream health status unknown'
    }
  };

  // Load health status on component mount
  useEffect(() => {
    loadHealthStatus();
  }, [channelId]);

  // Load health status from API
  const loadHealthStatus = async () => {
    try {
      const response = await streamHealthAPI.getChannelStatus(channelId);
      const data = response.data.data;
      
      if (data) {
        setHealthStatus(data.availability_status || 'unknown');
        setLastCheck(data.last_check);
        setResponseTime(data.response_time);
        setError(null);
        
        // Notify parent component of status change
        if (onStatusChange) {
          onStatusChange(data.availability_status);
        }
      }
    } catch (error) {
      console.error('Error loading health status:', error);
      setError(error.message);
      setHealthStatus('error');
    }
  };

  // Force health check
  const forceHealthCheck = async () => {
    try {
      setChecking(true);
      setError(null);
      
      const response = await streamHealthAPI.forceHealthCheck(channelId);
      const data = response.data.data;
      
      if (data) {
        setHealthStatus(data.availabilityStatus || 'unknown');
        setLastCheck(data.timestamp);
        setResponseTime(data.responseTime);
        
        // Notify parent component of status change
        if (onStatusChange) {
          onStatusChange(data.availabilityStatus);
        }
      }
    } catch (error) {
      console.error('Error forcing health check:', error);
      setError(error.message);
      setHealthStatus('error');
    } finally {
      setChecking(false);
    }
  };

  // Get current status configuration
  const currentConfig = statusConfig[healthStatus] || statusConfig.unknown;
  const StatusIcon = currentConfig.icon;

  // Format last check time
  const formatLastCheck = (timestamp) => {
    if (!timestamp) return 'Never';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  // Format response time
  const formatResponseTime = (ms) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // Build tooltip content
  const tooltipContent = (
    <div>
      <div><strong>Status:</strong> {currentConfig.label}</div>
      <div><strong>Last Check:</strong> {formatLastCheck(lastCheck)}</div>
      <div><strong>Response Time:</strong> {formatResponseTime(responseTime)}</div>
      {error && <div className="text-danger"><strong>Error:</strong> {error}</div>}
    </div>
  );

  return (
    <div className="d-flex align-items-center gap-2">
      <OverlayTrigger
        placement="top"
        overlay={<Tooltip>{tooltipContent}</Tooltip>}
      >
        <Badge 
          bg={currentConfig.color}
          className={`d-flex align-items-center gap-1 ${size === 'lg' ? 'p-2' : 'p-1'}`}
        >
          <StatusIcon size={size === 'lg' ? 14 : 12} />
          {showDetails && (
            <span className="ms-1">
              {currentConfig.label}
              {responseTime && ` (${formatResponseTime(responseTime)})`}
            </span>
          )}
        </Badge>
      </OverlayTrigger>
      
      {showDetails && (
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={forceHealthCheck}
          disabled={checking}
          title="Force health check"
        >
          {checking ? (
            <Spinner animation="border" size="sm" />
          ) : (
            <FaSync />
          )}
        </Button>
      )}
    </div>
  );
};

export default StreamHealthIndicator;
