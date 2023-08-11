/**
 * @file        - Azure Storage Service
 * @exports     - `AzureStorageService`
 * @since       - 5.0.1
 * @version     - 2.0.0
 * @implements  - BaseStorageService
 *
 * @see {@link https://learn.microsoft.com/en-us/javascript/api/@azure/storage-blob/?view=azure-node-latest | Azure Blob Documentation}
 * @see {@link https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/storage/storage-blob/MigrationGuide.md#uploading-a-blob-to-the-container | Azure Migration Guide}
 */

const BaseStorageService  = require('./BaseStorageService');
const { logger }          = require('@project-sunbird/logger');
const async               = require('async');
const _                   = require('lodash');
const dateFormat          = require('dateformat');
const uuidv1              = require('uuid/v1');
const multiparty          = require('multiparty');
const { TextDecoder }     = require("util");
const { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters } = require("@azure/storage-blob");
const READ='r'

export class AzureStorageService extends BaseStorageService {

  constructor(config) {
    super();
    if (!_.get(config, 'identity') || !_.get(config, 'credential')) {
      throw new Error('Azure__StorageService :: Required configuration is missing');
    }
    this.privateObjectStorage = _.get(config, 'privateObjectStorage')?.toString();
    try {
      this.sharedKeyCredential = new StorageSharedKeyCredential(config?.identity, config?.credential);
      this.blobService = new BlobServiceClient(
        `https://${config?.identity}.blob.core.windows.net`,
        this.sharedKeyCredential
      );
    } catch (error) {
      logger.info({ msg: 'Azure__StorageService - Unable to create Azure client' });
    }
  }

  async fileExists(container, fileToGet, callback) {
    if (!container || !fileToGet || !callback) throw new Error('Invalid arguments');
    logger.info({ msg: 'Azure__StorageService - fileExists called for container ' + container + ' for file ' + fileToGet });
    const blobClient = this.blobService.getContainerClient(container).getBlobClient(fileToGet);
    try {
      const blobProperties = await blobClient.getProperties()
      if (blobProperties) {
        const response = {
          exists: true
        }
        callback(null, response);
      }
    } catch (error) {
      callback(error);
    }
  }

  /**
   * @description                                                     - Retrieves a shared access signature token
   * @param  { string } container                                     - Container name
   * @param  { string } blob                                          - Blob to be fetched
   * @param  { azure.common.SharedAccessPolicy } sharedAccessPolicy   - Shared access policy
   * @param  { azure.common.ContentSettingsHeaders } headers          - Optional header values to set for a blob returned wth this SAS
   * @return { string }                                               - The shared access signature
   */
  generateSharedAccessSignature(container, blob, sharedAccessPolicy, headers) {
    const sasToken = generateBlobSASQueryParameters(
      {
        containerName: container,
        blobName: blob,
        ...sharedAccessPolicy.AccessPolicy,
        ...headers
      },
      this.sharedKeyCredential
    ).toString();
    return sasToken
  }

  /**
    * @description                                                    - Retrieves a blob or container URL
    * @param  { string } container                                    - Container name
    * @param  { string } blob                                         - Blob to be fetched
    * @param  { string } SASToken                                     - Shared Access Signature token
    * @return { string }                                              - Formatted URL string
    */
  getUrl(container, blob, SASToken) {
    const blobClient = this.blobService.getContainerClient(container).getBlobClient(blob);
    return `${blobClient.url}?${SASToken}`;
  }

  fileReadStream(container = undefined, fileToGet = undefined) {
    return async (req, res, next) => {
      let container = this.privateObjectStorage;
      let fileToGet = req.params.slug.replace('__', '\/') + '/' + req.params.filename;
      logger.info({ msg: 'Azure__StorageService - fileReadStream called for container ' + container + ' for file ' + fileToGet });
      if (fileToGet.includes('.json')) {
        const blobClient = this.blobService.getContainerClient(container).getBlobClient(fileToGet);
        try {
          const downloadResponse = await blobClient.download(0);
          downloadResponse.readableStreamBody.pipe(res);
          downloadResponse.readableStreamBody.on('end', () => {
            res.end();
          });
        } catch (error) {
          if (error && error.statusCode === 404) {
            logger.error({ msg: 'Azure__StorageService : readStream error - Error with status code 404', error: error });
            const response = {
              responseCode: "CLIENT_ERROR",
              params: {
                err: "CLIENT_ERROR",
                status: "failed",
                errmsg: "Blob not found"
              },
              result: {}
            }
            res.status(404).send(this.apiResponse(response));
          } else {
            logger.error({ msg: 'Azure__StorageService : readStream error - Error 500', error: error });
            const response = {
              responseCode: "SERVER_ERROR",
              params: {
                err: "SERVER_ERROR",
                status: "failed",
                errmsg: "Failed to display blob"
              },
              result: {}
            }
            res.status(500).send(this.apiResponse(response));
          }
        }
      } else {
        let startDate = new Date();
        let expiryDate = new Date(startDate);
        expiryDate.setMinutes(startDate.getMinutes() + 3600);
        startDate.setMinutes(startDate.getMinutes() - 3600);
       let sharedAccessPolicy = {
          AccessPolicy: {
            permissions: READ,
            startsOn: startDate,
            expiresOn: expiryDate
          }
        };
        this.fileExists(container, fileToGet, (err, resp) => {
          if (err || !(_.get(resp, 'exists'))) {
            logger.error({ msg: 'Azure__StorageService : doesBlobExist error - Error with status code 404', error: err });
            const response = {
              responseCode: "CLIENT_ERROR",
              params: {
                err: "CLIENT_ERROR",
                status: "failed",
                errmsg: "Blob not found"
              },
              result: {}
            }
            res.status(404).send(this.apiResponse(response));
          } else {
            let azureHeaders = {};
            if (req.headers['content-disposition'] == 'attachment' && req.headers.filename) azureHeaders.contentDisposition = `attachment;filename=${req.headers.filename}`;
            let token = this.generateSharedAccessSignature(container, fileToGet, sharedAccessPolicy, azureHeaders);
            let sasUrl = this.getUrl(container, fileToGet, token);
            const response = {
              responseCode: "OK",
              params: {
                err: null,
                status: "success",
                errmsg: null
              },
              result: {
                'signedUrl': sasUrl
              }
            }
            res.status(200).send(this.apiResponse(response));
          }
        })
      }
    }
  }

  async getBlobProperties(request, callback) {
    logger.info({ msg: 'Azure__StorageService - getBlobProperties called for container ' + request.container + ' for file ' + request.file });
    const blobClient = this.blobService.getContainerClient(request.container).getBlobClient(request.file);
    try {
      const blobProperties = await blobClient.getProperties()
      if (blobProperties) {
        blobProperties.reportname = request.reportname;
        blobProperties.filename = request.file;
        blobProperties.statusCode = 200;
        callback(null, blobProperties);
      }
    } catch (error) {
      logger.error({ msg: 'Azure__StorageService : readStream error - Error with status code 404' });
      callback({ msg: 'NotFound', statusCode: error.statusCode, filename: request.file, reportname: request.reportname });
    }
  }

  getFileProperties(container = undefined, fileToGet = undefined) {
    return (req, res, next) => {
      const container = this.privateObjectStorage;
      const fileToGet = JSON.parse(req.query.fileNames);
      logger.info({ msg: 'Azure__StorageService - getFileProperties called for container ' + container + ' for file ' + fileToGet });
      const responseData = {};
      if (Object.keys(fileToGet).length > 0) {
        const getBlogRequest = [];
        for (const [key, file] of Object.entries(fileToGet)) {
          const req = {
            container: container,
            file: file,
            reportname: key
          }
          getBlogRequest.push(
            async.reflect((callback) => {
              this.getBlobProperties(req, callback)
            })
          );
        }
        async.parallel(getBlogRequest, (err, results) => {
          if (results) {
            results.forEach(blob => {
              if (blob.error) {
                responseData[(_.get(blob, 'error.reportname'))] = blob.error
              } else {
                responseData[(_.get(blob, 'value.reportname'))] = {
                  lastModified: _.get(blob, 'value.lastModified'),
                  reportname: _.get(blob, 'value.reportname'),
                  statusCode: _.get(blob, 'value.statusCode'),
                  fileSize: _.get(blob, 'value.contentLength')
                }
              }
            });
            const finalResponse = {
              responseCode: "OK",
              params: {
                err: null,
                status: "success",
                errmsg: null
              },
              result: responseData
            }
            res.status(200).send(this.apiResponse(finalResponse))
          }
        });
      }
    }
  }

  async getFileAsText(container = undefined, fileToGet = undefined, callback) {
    const blobClient = this.blobService.getContainerClient(container).getBlobClient(fileToGet);
    try {
      const downloadResponse = await blobClient.download(0);
      const textDecoder = new TextDecoder('utf-8');
      const content = [];
      for await (const chunk of downloadResponse.readableStreamBody) {
        content.push(textDecoder.decode(chunk));
      }
      const text = content.join("");
      logger.info({ msg: 'Azure__StorageService : getFileAsText success for container ' + container + ' for file ' + fileToGet });
      callback(null, text);
    } catch (error) {
      logger.error({ msg: 'Azure__StorageService : getFileAsText error => ', error });
      delete error.request;
      delete error.response
      delete error.details
      callback(error)
    }
  }

  blockStreamUpload(uploadContainer = undefined) {
    return (req, res) => {
      try {
        const blobFolderName = new Date().toLocaleDateString();
        let form = new multiparty.Form();
        form.on('part', (part) => {
          if (part.filename) {
            var size = part.byteCount;
            var name = `${_.get(req, 'query.deviceId')}_${Date.now()}.${_.get(part, 'filename')}`;
            logger.info({
              msg: 'Azure__StorageService : blockStreamUpload Uploading file to container ' +
                uploadContainer + ' to folder ' + blobFolderName +
                ' for file name ' + name + ' with size ' + size
            });
            const blockBlobClient = this.blobService.getContainerClient(uploadContainer).getBlockBlobClient(`${blobFolderName}/${name}`);
            blockBlobClient.uploadStream(part, size, 5, {
              onProgress: (ev) => {
                console.log(ev.loadedBytes + " of " + ev.totalBytes + " bytes");
              },
            }).then((response) => {
              response = {
                responseCode: "OK",
                params: {
                  err: null,
                  status: "success",
                  errmsg: null
                },
                result: {
                  'message': 'Successfully uploaded to blob'
                }
              }
              return res.status(200).send(this.apiResponse(response, 'api.desktop.upload.crash.log'));
            }).catch((error) => {
              if (error && error.statusCode === 403) {
                const response = {
                  responseCode: "FORBIDDEN",
                  params: {
                    err: "FORBIDDEN",
                    status: "failed",
                    errmsg: "Unable to authorize to azure blob"
                  },
                  result: req.file
                }
                logger.error({
                  msg: 'Azure__StorageService : blockStreamUpload Unable to authorize to azure blob for uploading desktop crash logs',
                  error: error
                });
                return res.status(403).send(this.apiResponse(response, 'api.desktop.upload.crash.log'));
              } else if (error) {
                const response = {
                  responseCode: "SERVER_ERROR",
                  params: {
                    err: "SERVER_ERROR",
                    status: "failed",
                    errmsg: "Failed to upload to blob"
                  },
                  result: {}
                }
                logger.error({
                  msg: 'Azure__StorageService : blockStreamUpload Failed to upload desktop crash logs to blob',
                  error: error
                });
                return res.status(500).send(this.apiResponse(response, 'api.desktop.upload.crash.log'));
              }
            });
          }
        });
        form.parse(req);
      } catch (error) {
        const response = {
          responseCode: "SERVER_ERROR",
          params: {
            err: "SERVER_ERROR",
            status: "failed",
            errmsg: "Failed to upload to blob"
          },
          result: {}
        }
        logger.error({
          msg: 'Azure__StorageService : blockStreamUpload Failed to upload desktop crash logs to blob',
          error: error
        });
        return res.status(500).send(this.apiResponse(response, 'api.desktop.upload.crash.log'));
      }
    }
  }

  apiResponse({ responseCode, result, params: { err, errmsg, status } }, id = 'api.report') {
    return {
      'id': id,
      'ver': '1.0',
      'ts': dateFormat(new Date(), 'yyyy-mm-dd HH:MM:ss:lo'),
      'params': {
        'resmsgid': uuidv1(),
        'msgid': null,
        'status': status,
        'err': err,
        'errmsg': errmsg
      },
      'responseCode': responseCode,
      'result': result
    }
  }

  upload(container, fileName, filePath, callback) {
    throw new Error('AzureStorageService :: upload() must be implemented');
  }

  /**
   * @description                   - Generates a pre-signed URL for a specific operation on a file in Azure storage.
   * @param {string} container      - Azure container or bucket name.
   * @param {string} filePath       - Path to the file within the container.
   * @param {number} expiresIn      - Optional. Number of seconds before the pre-signed URL expires.
   * @param {string} permission     - Optional. The permission for the operation (e.g., READ, WRITE).
   * @returns {Promise<string>}     - A promise that resolves to the pre-signed URL.
   */
  getSignedUrl(container, filePath, expiresIn = 3600, permission = '') {
    let startDate = new Date();
    let expiryDate = new Date(startDate);
    expiryDate.setMinutes(startDate.getMinutes() + expiresIn);
    startDate.setMinutes(startDate.getMinutes() - expiresIn);
    let sharedAccessPolicy = {
      AccessPolicy: {
        permissions: (permission !== '') ? permission : READ,
        startsOn: startDate,
        expiresOn: expiryDate
      }
    };
    let azureHeaders = {};
    let token = this.generateSharedAccessSignature(container, filePath, sharedAccessPolicy, azureHeaders);
    let sasUrl = this.getUrl(container, filePath, token);
    return Promise.resolve(sasUrl);
  }

  /**
   * @description                     - Generates a pre-signed URL for downloading a file from the Azure storage.
   * @param {string} container        - Azure container or bucket name.
   * @param {string} filePath         - Path to the file within the container.
   * @param {number} expiresIn        - Optional. Number of seconds before the pre-signed URL expires.
   * @returns {Promise<string>}       - A promise that resolves to the downloadable URL.
   */
  getDownloadableUrl(container, filePath, expiresIn = 3600) {
    let startDate = new Date();
    let expiryDate = new Date(startDate);
    expiryDate.setMinutes(startDate.getMinutes() + expiresIn);
    let sharedAccessPolicy = {
      AccessPolicy: {
        permissions: READ,
        startsOn: startDate,
        expiresOn: expiryDate
      }
    };
    let azureHeaders = {};
    let token = this.generateSharedAccessSignature(container, filePath, sharedAccessPolicy, azureHeaders);
    let downloadableUrl = this.getUrl(container, filePath, token);
    return Promise.resolve(downloadableUrl);
  }
}