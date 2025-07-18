import React, { useState, useEffect } from 'react';
import { Badge, Button, Spinner, OverlayTrigger, Tooltip, Modal, Alert, ProgressBar } from 'react-bootstrap';
import { FaPlay, FaStop, FaSync, FaBrain, FaChartLine, FaInfoCircle, FaExclamationTriangle } from 'react-icons/fa';
import { smartTranscodingAPI } from '../services/api';
import { toast } from 'react-toastify';

const SmartTranscodingStatus = ({ 
  channel, 
  onTranscodingToggle, 
  onTranscodingRestart,
  isActionPending = false 
}) => {
  const [smartData, setSmartData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // Load smart transcoding data
  const loadSmartData = async () => {
    if (!channel?.id) return;
    
    try {
      setLoading(true);
      const [healthResponse, fallbackResponse, cacheResponse] = await Promise.allSettled([
        smartTranscodingAPI.getChannelHealth(channel.id),
        smartTranscodingAPI.getFallbackStats(channel.id),
        smartTranscodingAPI.getCachedAnalysis(channel.id)
      ]);

      const smartInfo = {
        health: healthResponse.status === 'fulfilled' ? healthResponse.value.data?.data : null,
        fallback: fallbackResponse.status === 'fulfilled' ? fallbackResponse.value.data?.data : null,
        cache: cacheResponse.status === 'fulfilled' ? cacheResponse.value.data?.data : null
      };

      setSmartData(smartInfo);
    } catch (error) {
      console.error('Error loading smart transcoding data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSmartData();
  }, [channel?.id, channel?.transcoding_status]);

  // Determine transcoding mode
  const getTranscodingMode = () => {
    if (!channel?.transcoding_enabled) return 'disabled';
    if (smartData?.health?.smartTranscoding?.enabled) return 'smart';
    return 'traditional';
  };

  // Get fallback level display
  const getFallbackDisplay = () => {
    const fallbackLevel = smartData?.fallback?.level || 0;
    if (fallbackLevel === 0) return null;
    
    const levelNames = {
      1: 'Codec Optimization',
      2: 'Resolution Scaling', 
      3: 'Emergency Mode'
    };
    
    return {
      level: fallbackLevel,
      name: levelNames[fallbackLevel] || 'Unknown',
      color: fallbackLevel === 1 ? 'warning' : fallbackLevel === 2 ? 'info' : 'danger'
    };
  };

  // Get confidence score display
  const getConfidenceDisplay = () => {
    const score = smartData?.health?.smartTranscoding?.stabilityScore || 0;
    if (score === 0) return null;
    
    const percentage = Math.round(score * 100);
    let color = 'success';
    if (percentage < 50) color = 'danger';
    else if (percentage < 75) color = 'warning';
    
    return { percentage, color };
  };

  // Handle stream analysis
  const handleAnalyzeStream = async () => {
    try {
      setAnalyzing(true);
      await smartTranscodingAPI.analyzeStream(channel.id, true);
      toast.success('Stream analysis completed');
      setTimeout(loadSmartData, 1000);
    } catch (error) {
      console.error('Error analyzing stream:', error);
      toast.error('Failed to analyze stream');
    } finally {
      setAnalyzing(false);
    }
  };

  // Handle reset fallback
  const handleResetFallback = async () => {
    try {
      await smartTranscodingAPI.resetFallbackTracking(channel.id);
      toast.success('Fallback tracking reset');
      loadSmartData();
    } catch (error) {
      console.error('Error resetting fallback:', error);
      toast.error('Failed to reset fallback tracking');
    }
  };

  // Handle clear cache
  const handleClearCache = async () => {
    try {
      await smartTranscodingAPI.clearAnalysisCache(channel.id);
      toast.success('Analysis cache cleared');
      loadSmartData();
    } catch (error) {
      console.error('Error clearing cache:', error);
      toast.error('Failed to clear analysis cache');
    }
  };

  const mode = getTranscodingMode();
  const fallback = getFallbackDisplay();
  const confidence = getConfidenceDisplay();
  const lastAnalysis = smartData?.cache?.analysis?.timestamp;

  return (
    <div className="d-flex flex-column gap-1">
      {/* Main Status Display */}
      <div className="d-flex align-items-center gap-2">
        {/* Transcoding Status Badge */}
        {channel?.transcoding_enabled ? (
          channel.transcoding_status === 'active' ? (
            <Badge bg="success">
              <FaPlay className="me-1" />
              Active
            </Badge>
          ) : channel.transcoding_status === 'starting' ? (
            <Badge bg="warning">
              <FaSync className="me-1 fa-spin" />
              Starting
            </Badge>
          ) : channel.transcoding_status === 'stopping' ? (
            <Badge bg="warning">
              <FaStop className="me-1" />
              Stopping
            </Badge>
          ) : channel.transcoding_status === 'failed' ? (
            <Badge bg="danger">
              <FaExclamationTriangle className="me-1" />
              Failed
            </Badge>
          ) : (
            <Badge bg="secondary">
              Inactive
            </Badge>
          )
        ) : (
          <Badge bg="secondary">
            Disabled
          </Badge>
        )}

        {/* Mode Indicator */}
        {mode === 'smart' && (
          <Badge bg="info" className="d-flex align-items-center gap-1">
            <FaBrain size={10} />
            Smart
          </Badge>
        )}
        
        {mode === 'traditional' && (
          <Badge bg="dark" className="d-flex align-items-center gap-1">
            Traditional
          </Badge>
        )}
        
        {/* Fallback Level */}
        {fallback && (
          <OverlayTrigger
            placement="top"
            overlay={<Tooltip>Fallback Level {fallback.level}: {fallback.name}</Tooltip>}
          >
            <Badge bg={fallback.color} className="d-flex align-items-center gap-1">
              L{fallback.level}
            </Badge>
          </OverlayTrigger>
        )}
      </div>

      {/* Smart Transcoding Details */}
      {mode === 'smart' && (
        <div className="d-flex align-items-center gap-2 small">
          {/* Confidence Score */}
          {confidence && (
            <OverlayTrigger
              placement="top"
              overlay={<Tooltip>Stream Stability: {confidence.percentage}%</Tooltip>}
            >
              <div className="d-flex align-items-center gap-1">
                <FaChartLine size={12} className={`text-${confidence.color}`} />
                <span className={`text-${confidence.color}`}>{confidence.percentage}%</span>
              </div>
            </OverlayTrigger>
          )}

          {/* Last Analysis */}
          {lastAnalysis && (
            <div className="text-muted">
              <small>
                Analyzed: {new Date(lastAnalysis).toLocaleString()}
              </small>
            </div>
          )}

          {/* Details Button */}
          <Button
            variant="outline-info"
            size="sm"
            onClick={() => setShowDetailsModal(true)}
            className="p-1"
          >
            <FaInfoCircle size={12} />
          </Button>
        </div>
      )}

      {/* Control Buttons */}
      <div className="d-flex gap-1">
        {channel?.transcoding_enabled && (
          <>
            {channel.transcoding_status === 'active' && (
              <Button
                variant="outline-warning"
                size="sm"
                onClick={() => onTranscodingRestart(channel.id)}
                disabled={isActionPending}
                title="Restart Transcoding"
              >
                <FaSync />
              </Button>
            )}
            <Button
              variant="outline-danger"
              size="sm"
              onClick={() => onTranscodingToggle(channel.id, false)}
              disabled={isActionPending}
              title="Disable Transcoding"
            >
              <FaStop />
            </Button>
          </>
        )}
        
        {!channel?.transcoding_enabled && (
          <Button
            variant="outline-success"
            size="sm"
            onClick={() => onTranscodingToggle(channel.id, true)}
            disabled={isActionPending}
            title="Enable Transcoding"
          >
            <FaPlay />
          </Button>
        )}
      </div>

      {/* Smart Transcoding Details Modal */}
      <Modal show={showDetailsModal} onHide={() => setShowDetailsModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            <FaBrain className="me-2" />
            Smart Transcoding Details - {channel?.name}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {loading ? (
            <div className="text-center py-4">
              <Spinner animation="border" />
              <div className="mt-2">Loading smart transcoding data...</div>
            </div>
          ) : (
            <div className="row">
              {/* Health Information */}
              <div className="col-md-6">
                <h6>🎯 Stream Health</h6>
                <div className="mb-3">
                  <div className="d-flex justify-content-between">
                    <span>Status:</span>
                    <Badge bg={smartData?.health?.health?.status === 'healthy' ? 'success' : 'warning'}>
                      {smartData?.health?.health?.status || 'Unknown'}
                    </Badge>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span>Response Time:</span>
                    <span>{smartData?.health?.health?.responseTime || 'N/A'}ms</span>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span>Uptime:</span>
                    <span>{smartData?.health?.health?.uptime || 'N/A'}%</span>
                  </div>
                </div>

                <h6>🧠 Smart Transcoding</h6>
                <div className="mb-3">
                  <div className="d-flex justify-content-between">
                    <span>Enabled:</span>
                    <Badge bg={smartData?.health?.smartTranscoding?.enabled ? 'success' : 'secondary'}>
                      {smartData?.health?.smartTranscoding?.enabled ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                  {smartData?.health?.smartTranscoding?.stabilityScore && (
                    <>
                      <div className="d-flex justify-content-between mb-2">
                        <span>Stability Score:</span>
                        <span>{Math.round(smartData.health.smartTranscoding.stabilityScore * 100)}%</span>
                      </div>
                      <ProgressBar 
                        now={smartData.health.smartTranscoding.stabilityScore * 100} 
                        variant={smartData.health.smartTranscoding.stabilityScore > 0.7 ? 'success' : 'warning'}
                      />
                    </>
                  )}
                  {smartData?.health?.smartTranscoding?.lastAnalysis && (
                    <div className="d-flex justify-content-between">
                      <span>Last Analysis:</span>
                      <span>{new Date(smartData.health.smartTranscoding.lastAnalysis).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Fallback Information */}
              <div className="col-md-6">
                <h6>🔄 Fallback Status</h6>
                <div className="mb-3">
                  <div className="d-flex justify-content-between">
                    <span>Current Level:</span>
                    <Badge bg={fallback ? fallback.color : 'success'}>
                      {fallback ? `L${fallback.level} - ${fallback.name}` : 'None'}
                    </Badge>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span>Total Attempts:</span>
                    <span>{smartData?.fallback?.attempts || 0}</span>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span>Permanent Failure:</span>
                    <Badge bg={smartData?.fallback?.isPermanentFailure ? 'danger' : 'success'}>
                      {smartData?.fallback?.isPermanentFailure ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                </div>

                <h6>💾 Analysis Cache</h6>
                <div className="mb-3">
                  <div className="d-flex justify-content-between">
                    <span>Has Cache:</span>
                    <Badge bg={smartData?.cache?.hasCache ? 'success' : 'secondary'}>
                      {smartData?.cache?.hasCache ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span>Cache Valid:</span>
                    <Badge bg={smartData?.cache?.isValid ? 'success' : 'warning'}>
                      {smartData?.cache?.isValid ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                  {smartData?.cache?.analysis?.codec && (
                    <div className="d-flex justify-content-between">
                      <span>Detected Codec:</span>
                      <span>{smartData.cache.analysis.codec}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error Messages */}
          {smartData?.fallback?.errors && smartData.fallback.errors.length > 0 && (
            <Alert variant="warning">
              <h6>Recent Errors:</h6>
              <ul className="mb-0">
                {smartData.fallback.errors.slice(-3).map((error, index) => (
                  <li key={index}>
                    <small>
                      <strong>L{error.level}:</strong> {error.error}
                      <br />
                      <em>{new Date(error.timestamp).toLocaleString()}</em>
                    </small>
                  </li>
                ))}
              </ul>
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer>
          <div className="d-flex gap-2 w-100">
            <Button
              variant="outline-primary"
              onClick={handleAnalyzeStream}
              disabled={analyzing}
            >
              {analyzing ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  Analyzing...
                </>
              ) : (
                <>
                  <FaBrain className="me-2" />
                  Analyze Stream
                </>
              )}
            </Button>
            
            {fallback && (
              <Button variant="outline-warning" onClick={handleResetFallback}>
                Reset Fallback
              </Button>
            )}
            
            {smartData?.cache?.hasCache && (
              <Button variant="outline-secondary" onClick={handleClearCache}>
                Clear Cache
              </Button>
            )}
            
            <Button variant="secondary" onClick={() => setShowDetailsModal(false)} className="ms-auto">
              Close
            </Button>
          </div>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default SmartTranscodingStatus;
