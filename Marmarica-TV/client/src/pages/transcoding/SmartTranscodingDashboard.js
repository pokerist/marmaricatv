import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Badge, Button, Alert, ProgressBar, Spinner } from 'react-bootstrap';
import { FaBrain, FaChartLine, FaExclamationTriangle, FaSync, FaTrash, FaCog, FaPlay, FaStop } from 'react-icons/fa';
import { smartTranscodingAPI } from '../../services/api';
import { toast } from 'react-toastify';

const SmartTranscodingDashboard = () => {
  const [systemStats, setSystemStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [initializingSystem, setInitializingSystem] = useState(false);

  // Load system statistics
  const loadSystemStats = async () => {
    try {
      setLoading(true);
      const response = await smartTranscodingAPI.getSystemStats();
      setSystemStats(response.data?.data || null);
    } catch (error) {
      console.error('Error loading system stats:', error);
      toast.error('Failed to load smart transcoding statistics');
    } finally {
      setLoading(false);
    }
  };

  // Refresh statistics
  const refreshStats = async () => {
    try {
      setRefreshing(true);
      await loadSystemStats();
      toast.success('Statistics refreshed successfully');
    } catch (error) {
      console.error('Error refreshing stats:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Initialize smart transcoding system
  const initializeSystem = async () => {
    try {
      setInitializingSystem(true);
      await smartTranscodingAPI.initializeSystem();
      toast.success('Smart transcoding system initialized successfully');
      setTimeout(loadSystemStats, 1000);
    } catch (error) {
      console.error('Error initializing system:', error);
      toast.error('Failed to initialize smart transcoding system');
    } finally {
      setInitializingSystem(false);
    }
  };

  useEffect(() => {
    loadSystemStats();
    
    // Set up periodic refresh
    const interval = setInterval(loadSystemStats, 10000); // Refresh every 10 seconds
    
    return () => clearInterval(interval);
  }, []);

  // Render system status
  const renderSystemStatus = () => {
    if (!systemStats) return null;

    const { system } = systemStats;
    
    return (
      <Card className="mb-4">
        <Card.Header className="bg-primary text-white">
          <h5 className="mb-0">
            <FaBrain className="me-2" />
            Smart Transcoding System Status
          </h5>
        </Card.Header>
        <Card.Body>
          <Row>
            <Col md={3}>
              <div className="text-center p-3 border rounded">
                <h4 className="text-info mb-1">{system?.activeProcesses || 0}</h4>
                <small className="text-muted">Active Processes</small>
              </div>
            </Col>
            <Col md={3}>
              <div className="text-center p-3 border rounded">
                <h4 className={`mb-1 ${system?.smartModeEnabled ? 'text-success' : 'text-danger'}`}>
                  {system?.smartModeEnabled ? 'Enabled' : 'Disabled'}
                </h4>
                <small className="text-muted">Smart Mode</small>
              </div>
            </Col>
            <Col md={3}>
              <div className="text-center p-3 border rounded">
                <h4 className="text-warning mb-1">{system?.cacheStats?.totalEntries || 0}</h4>
                <small className="text-muted">Cache Entries</small>
              </div>
            </Col>
            <Col md={3}>
              <div className="text-center p-3 border rounded">
                <h4 className="text-danger mb-1">{system?.fallbackStats?.totalChannelsWithFallback || 0}</h4>
                <small className="text-muted">Fallback Channels</small>
              </div>
            </Col>
          </Row>
          
          <hr className="my-4" />
          
          <Row>
            <Col md={6}>
              <h6 className="mb-3">📊 Cache Statistics</h6>
              {system?.cacheStats ? (
                <div className="d-flex flex-column gap-2">
                  <div className="d-flex justify-content-between">
                    <span>Hit Rate:</span>
                    <span className="text-success">{Math.round((system.cacheStats.hitRate || 0) * 100)}%</span>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span>Total Hits:</span>
                    <span>{system.cacheStats.totalHits || 0}</span>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span>Total Misses:</span>
                    <span>{system.cacheStats.totalMisses || 0}</span>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span>Expired Entries:</span>
                    <span>{system.cacheStats.expiredEntries || 0}</span>
                  </div>
                </div>
              ) : (
                <div className="text-muted">No cache statistics available</div>
              )}
            </Col>
            <Col md={6}>
              <h6 className="mb-3">🔄 Fallback Statistics</h6>
              {system?.fallbackStats ? (
                <div className="d-flex flex-column gap-2">
                  <div className="d-flex justify-content-between">
                    <span>Level 1 Fallbacks:</span>
                    <Badge bg="warning">{system.fallbackStats.fallbackLevels?.level1 || 0}</Badge>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span>Level 2 Fallbacks:</span>
                    <Badge bg="info">{system.fallbackStats.fallbackLevels?.level2 || 0}</Badge>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span>Level 3 Fallbacks:</span>
                    <Badge bg="danger">{system.fallbackStats.fallbackLevels?.level3 || 0}</Badge>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span>Permanent Failures:</span>
                    <Badge bg="dark">{system.fallbackStats.permanentFailures || 0}</Badge>
                  </div>
                </div>
              ) : (
                <div className="text-muted">No fallback statistics available</div>
              )}
            </Col>
          </Row>
        </Card.Body>
      </Card>
    );
  };

  // Render database statistics
  const renderDatabaseStats = () => {
    if (!systemStats?.database) return null;

    const { database } = systemStats;
    
    return (
      <Card className="mb-4">
        <Card.Header className="bg-success text-white">
          <h5 className="mb-0">
            <FaChartLine className="me-2" />
            Database Statistics (Last 7 Days)
          </h5>
        </Card.Header>
        <Card.Body>
          <Row>
            <Col md={6}>
              <h6 className="mb-3">📈 Job Statistics</h6>
              <div className="d-flex flex-column gap-2">
                <div className="d-flex justify-content-between">
                  <span>Total Jobs:</span>
                  <span>{database.total_jobs || 0}</span>
                </div>
                <div className="d-flex justify-content-between">
                  <span>Smart Jobs:</span>
                  <Badge bg="info">{database.smart_jobs || 0}</Badge>
                </div>
                <div className="d-flex justify-content-between">
                  <span>Fallback Jobs:</span>
                  <Badge bg="warning">{database.fallback_jobs || 0}</Badge>
                </div>
                <div className="d-flex justify-content-between">
                  <span>Smart Successes:</span>
                  <Badge bg="success">{database.smart_successes || 0}</Badge>
                </div>
                <div className="d-flex justify-content-between">
                  <span>Smart Failures:</span>
                  <Badge bg="danger">{database.smart_failures || 0}</Badge>
                </div>
              </div>
            </Col>
            <Col md={6}>
              <h6 className="mb-3">🎯 Performance Metrics</h6>
              <div className="d-flex flex-column gap-2">
                <div className="d-flex justify-content-between mb-2">
                  <span>Average Confidence:</span>
                  <span>{Math.round((database.avg_confidence || 0) * 100)}%</span>
                </div>
                <ProgressBar 
                  now={(database.avg_confidence || 0) * 100} 
                  variant={(database.avg_confidence || 0) > 0.7 ? 'success' : 'warning'}
                />
                
                {database.smart_jobs > 0 && (
                  <>
                    <div className="d-flex justify-content-between mt-3">
                      <span>Smart Job Success Rate:</span>
                      <span>{Math.round(((database.smart_successes || 0) / database.smart_jobs) * 100)}%</span>
                    </div>
                    <ProgressBar 
                      now={((database.smart_successes || 0) / database.smart_jobs) * 100} 
                      variant={((database.smart_successes || 0) / database.smart_jobs) > 0.8 ? 'success' : 'warning'}
                    />
                  </>
                )}
                
                {database.fallback_jobs > 0 && (
                  <div className="d-flex justify-content-between mt-2">
                    <span>Fallback Rate:</span>
                    <span>{Math.round((database.fallback_jobs / database.total_jobs) * 100)}%</span>
                  </div>
                )}
              </div>
            </Col>
          </Row>
        </Card.Body>
      </Card>
    );
  };

  // Render system alerts
  const renderSystemAlerts = () => {
    if (!systemStats) return null;

    const alerts = [];
    
    // Check for high fallback rate
    if (systemStats.database?.fallback_jobs > 0 && systemStats.database?.total_jobs > 0) {
      const fallbackRate = (systemStats.database.fallback_jobs / systemStats.database.total_jobs) * 100;
      if (fallbackRate > 20) {
        alerts.push({
          type: 'warning',
          title: 'High Fallback Rate',
          message: `${Math.round(fallbackRate)}% of jobs are using fallback profiles. Consider optimizing stream quality or transcoding profiles.`
        });
      }
    }
    
    // Check for permanent failures
    if (systemStats.system?.fallbackStats?.permanentFailures > 0) {
      alerts.push({
        type: 'danger',
        title: 'Permanent Failures Detected',
        message: `${systemStats.system.fallbackStats.permanentFailures} channels have permanent failures. Manual intervention may be required.`
      });
    }
    
    // Check for low cache hit rate
    if (systemStats.system?.cacheStats?.hitRate < 0.5) {
      alerts.push({
        type: 'info',
        title: 'Low Cache Hit Rate',
        message: `Cache hit rate is ${Math.round(systemStats.system.cacheStats.hitRate * 100)}%. Consider adjusting cache duration or stream analysis frequency.`
      });
    }
    
    // Check if smart mode is disabled
    if (!systemStats.system?.smartModeEnabled) {
      alerts.push({
        type: 'warning',
        title: 'Smart Mode Disabled',
        message: 'Smart transcoding is currently disabled. Enable it to take advantage of intelligent stream analysis and fallback features.'
      });
    }

    if (alerts.length === 0) return null;

    return (
      <Card className="mb-4">
        <Card.Header className="bg-warning text-dark">
          <h5 className="mb-0">
            <FaExclamationTriangle className="me-2" />
            System Alerts
          </h5>
        </Card.Header>
        <Card.Body>
          {alerts.map((alert, index) => (
            <Alert key={index} variant={alert.type} className="mb-3">
              <Alert.Heading>{alert.title}</Alert.Heading>
              <p className="mb-0">{alert.message}</p>
            </Alert>
          ))}
        </Card.Body>
      </Card>
    );
  };

  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="page-title">
          <FaBrain className="me-2" />
          Smart Transcoding Dashboard
        </h1>
        <div className="d-flex gap-2">
          <Button
            variant="outline-primary"
            onClick={refreshStats}
            disabled={refreshing}
          >
            {refreshing ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Refreshing...
              </>
            ) : (
              <>
                <FaSync className="me-2" />
                Refresh
              </>
            )}
          </Button>
          <Button
            variant="outline-success"
            onClick={initializeSystem}
            disabled={initializingSystem}
          >
            {initializingSystem ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Initializing...
              </>
            ) : (
              <>
                <FaCog className="me-2" />
                Initialize System
              </>
            )}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <Spinner animation="border" variant="primary" />
          <div className="mt-3">Loading smart transcoding dashboard...</div>
        </div>
      ) : systemStats ? (
        <>
          {/* System Status */}
          {renderSystemStatus()}
          
          {/* System Alerts */}
          {renderSystemAlerts()}
          
          {/* Database Statistics */}
          {renderDatabaseStats()}
          
          {/* Quick Actions */}
          <Card className="mb-4">
            <Card.Header className="bg-info text-white">
              <h5 className="mb-0">
                <FaCog className="me-2" />
                Quick Actions
              </h5>
            </Card.Header>
            <Card.Body>
              <Row>
                <Col md={12}>
                  <div className="d-flex gap-2 flex-wrap">
                    <Button
                      variant="outline-primary"
                      onClick={() => window.open('/docs/SMART_TRANSCODING_GUIDE.md', '_blank')}
                    >
                      📚 View Documentation
                    </Button>
                    <Button
                      variant="outline-info"
                      onClick={() => toast.info('System monitoring is active. Statistics refresh every 10 seconds.')}
                    >
                      📊 Monitor System
                    </Button>
                    <Button
                      variant="outline-success"
                      onClick={() => toast.success('Smart transcoding is optimizing your streams automatically!')}
                    >
                      🚀 Optimize Streams
                    </Button>
                  </div>
                </Col>
              </Row>
            </Card.Body>
          </Card>
          
          {/* Footer Information */}
          <Card className="bg-light">
            <Card.Body className="text-center">
              <small className="text-muted">
                Last updated: {new Date().toLocaleString()} | 
                Statistics refresh automatically every 10 seconds | 
                Smart Transcoding v1.0
              </small>
            </Card.Body>
          </Card>
        </>
      ) : (
        <Alert variant="warning" className="text-center">
          <Alert.Heading>No Data Available</Alert.Heading>
          <p>
            Unable to load smart transcoding statistics. This could indicate that:
          </p>
          <ul className="text-start">
            <li>The smart transcoding system is not initialized</li>
            <li>No transcoding processes have been started yet</li>
            <li>There's a connectivity issue with the backend</li>
          </ul>
          <hr />
          <div className="d-flex gap-2 justify-content-center">
            <Button variant="outline-primary" onClick={refreshStats}>
              <FaSync className="me-2" />
              Retry
            </Button>
            <Button variant="outline-success" onClick={initializeSystem}>
              <FaCog className="me-2" />
              Initialize System
            </Button>
          </div>
        </Alert>
      )}
    </Container>
  );
};

export default SmartTranscodingDashboard;
