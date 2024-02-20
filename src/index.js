
/**
 * @file        - Entry file referencing Storage Service
 * @description - Entry file referencing Storage Service
 * @exports     - `AzureStorageService`, `AWSStorageService`,'GCPStorageService` and `OCIStorageService`
 * @author      - RAJESH KUMARAVEL
 * @since       - 5.0.3
 * @version     - 2.0.0
 */

const AzureStorageService = require('./AzureStorageService');
const AWSStorageService = require('./AWSStorageService');
const GCPStorageService = require('./GCPStorageService');
const OCIStorageService = require('./OCIStorageService');
const S3StorageService = require('./S3StorageService');


/**
 * Based on Environment Cloud Provider value
 * Export respective Storage Service
 */

export function init(config) {
  switch (config.provider) {
    case 'azure':
      return new AzureStorageService.AzureStorageService(config)
      break;
    case 'aws':
      return new AWSStorageService.AWSStorageService(config)
      break;
    case 'gcloud':
      return new GCPStorageService.GCPStorageService(config)
      break;
    case 'oci':
      return new OCIStorageService.OCIStorageService(config)
      break;
    case 's3':
      return new S3StorageService.S3StorageService(config)
      break;
    default:
      throw new Error(`Client Cloud Service - ${config.provider} provider is not supported`);
  }
}
