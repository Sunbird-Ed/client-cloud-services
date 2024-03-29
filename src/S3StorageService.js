/**
 * @file        - S3 Storage Service
 * @exports     - `S3StorageService`
 * @since       - 5.0.1
 * @version     - 1.0.0
 * @implements  - BaseStorageService
 * @note        - This is not an aws-s3 storage but this will work with aws-s3 as well. In this we dont have to pass region as parameter and it will be used by NIC private server.
 */

const BaseStorageService  = require('./BaseStorageService');
const { logger }          = require('@project-sunbird/logger');
const _                   = require('lodash');
const dateFormat          = require('dateformat');
const uuidv1              = require('uuid/v1');
const async               = require('async');
const storageLogger       = require('./storageLogger');
const { getSignedUrl }    = require("@aws-sdk/s3-request-presigner");
const { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { Upload }          = require("@aws-sdk/lib-storage");
const multiparty          = require('multiparty');
const WRITE = 'w';
const AWS = require('aws-sdk');
export class S3StorageService extends BaseStorageService {

  constructor(config) {
    super();
    if (!_.get(config, 'identity') || !_.get(config, 'credential') || !_.get(config, 'endpoint')) {
      throw new Error('S3 :: Required configuration is missing');
    }
    process.env.S3_ACCESS_KEY_ID = _.get(config, 'identity');
    process.env.S3_SECRET_ACCESS_KEY = _.get(config, 'credential');
    process.env.S3_ENDPOINT = _.get(config, 'endpoint');
    this.client = new AWS.S3({
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        endpoint: process.env.S3_ENDPOINT,
        s3ForcePathStyle: true,
      });
  }

  /**
   * @description                     - Function to generate S3 command for an operation
   * @param  {string} bucketName      - S3 bucket name
   * @param  {string} fileToGet       - S3 File to fetch
   * @param  {string} prefix          - `Optional` - Prefix for file path
   * @param  {string} permission      - `Optional` - operation permission
   * @returns                         - S3 Command to be executed by SDK
   */
  getS3Command(bucketName, fileToGet, prefix = '', permission = '') {
    if ( permission === WRITE ) {
      return new PutObjectCommand({ Bucket: bucketName, Key: prefix + fileToGet });
    } else {
      return new GetObjectCommand({ Bucket: bucketName, Key: prefix + fileToGet });
    }
  }

  /**
   * @description                     - Function to check whether file exists in specified bucket or not
   * @param  {string} bucketName      - S3 bucket name
   * @param  {string} fileToGet       - S3 File to check
   * @param  {string} prefix          - `Optional` - Prefix for file path
   * @param  {function} cb            - Callback function
   */
  async fileExists(bucketName, fileToGet, prefix = '', cb) {
    const params = { Bucket: bucketName, Key: prefix + fileToGet };
    const command = new HeadObjectCommand(params);
    logger.info({ msg: 'S3__StorageService - fileExists called for bucketName ' + bucketName + ' for file ' + params.Key });
    await this.client.send(command).then((resp) => {
      cb(null, resp)
    }).catch((err) => {
      cb(err);
    });
  }

  /**
   * @description                     - Provides a stream to read from a storage
   * @param {string} bucketName       - Bucket name or folder name in storage service
   * @param {string} fileToGet        - File path in storage service
   */
  fileReadStream(_bucketName = undefined, fileToGet = undefined) {
    return async (req, res, next) => {
      let bucketName = _bucketName;
      let fileToGet = req.params.slug.replace('__', '\/') + '/' + req.params.filename;
      logger.info({ msg: 'S3__StorageService - fileReadStream called for bucketName ' + bucketName + ' for file ' + fileToGet });

      if (fileToGet.includes('.json')) {
        const streamToString = (stream) =>
          new Promise((resolve, reject) => {
            const chunks = [];
            stream.on("data", (chunk) => chunks.push(chunk));
            stream.on("error", (err) => {
              reject(err)
            });
            stream.on("end", () => {
              resolve(Buffer.concat(chunks).toString("utf8"))
            });
          });
        await this.client.send(this.getS3Command(bucketName, fileToGet, undefined)).then((resp) => {
          streamToString(_.get(resp, 'Body')).then((data) => {
            res.end(data);
          }).catch((err) => {
            storageLogger.s500(res, 'S3__StorageService : readStream error - Error 500', err, 'Failed to execute readStream');
          });
        }).catch((error) => {
          if (_.get(error, '$metadata.httpStatusCode') == 404) {
            storageLogger.s404(res, 'S3__StorageService : readStream client send error - Error with status code 404', error, 'File not found');
          } else {
            storageLogger.s500(res, 'S3__StorageService : readStream client send error - Error 500', error, 'Failed to display blob');
          }
        });
      } else {
        this.fileExists(bucketName, fileToGet, undefined, async (error, resp) => {
          if (_.get(error, '$metadata.httpStatusCode') == 404) {
            storageLogger.s404(res, 'S3__StorageService : fileExists error - Error with status code 404', error, 'File does not exists');
          } else if (_.get(resp, '$metadata.httpStatusCode') == 200) {
            const command = this.getS3Command(bucketName, fileToGet, undefined);
            // `expiresIn` - The number of seconds before the presigned URL expires
            const presignedURL = await getSignedUrl(this.client, command, { expiresIn: 3600 });
            const response = {
              responseCode: "OK",
              params: {
                err: null,
                status: "success",
                errmsg: null
              },
              result: {
                'signedUrl': presignedURL
              }
            }
            res.status(200).send(this.apiResponse(response));
          } else {
            storageLogger.s500(res, 'S3__StorageService : fileExists client send error - Error 500', '', 'Failed to check file exists');
          }
        });
      }
    }
  }

  getFileProperties(_bucketName = undefined) {
    return (req, res, next) => {
      const bucketName = _bucketName;
      const fileToGet = JSON.parse(req.query.fileNames);
      logger.info({ msg: 'S3__StorageService - getFileProperties called for bucketName ' + bucketName + ' for file ' + fileToGet });
      const responseData = {};
      if (Object.keys(fileToGet).length > 0) {
        const getBlogRequest = [];
        for (const [key, file] of Object.entries(fileToGet)) {
          const req = {
            bucketName: bucketName,
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

  async getBlobProperties(request, callback) {
    this.fileExists(request.bucketName, request.file, undefined, (error, resp) => {
      if (_.get(error, '$metadata.httpStatusCode') == 404) {
        logger.error({ msg: 'S3__StorageService : getBlobProperties_fileExists error - Error with status code 404. File does not exists - ' + request.file, error: error });
        callback({ msg: _.get(error, 'name'), statusCode: _.get(error, '$metadata.httpStatusCode'), filename: request.file, reportname: request.reportname })
      } else if (_.get(resp, '$metadata.httpStatusCode') == 200) {
        resp.reportname = request.reportname;
        resp.statusCode = 200;
        logger.info({
          msg: 'S3__StorageService : getBlobProperties_fileExists success with status code 200. File does exists - ' +
            request.file, statusCode: _.get(error, '$metadata.httpStatusCode')
        });
        callback(null, resp);
      } else {
        logger.error({msg: 'S3__StorageService : getBlobProperties_fileExists client send error - Error 500 Failed to check file exists'});
        callback(true);
      }
    });

  }

  async getFileAsText(container = undefined, fileToGet = undefined, callback) {
    const bucketName = container;
    logger.info({ msg: 'S3__StorageService : getFileAsText called for bucket ' + bucketName + ' for file ' + fileToGet });
    const streamToString = (stream) =>
      new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("error", (err) => {
          reject(err)
        });
        stream.on("end", () => {
          resolve(Buffer.concat(chunks).toString("utf8"))
        });
      });
    await this.client.send(this.getS3Command(bucketName, fileToGet)).then((resp) => {
      streamToString(_.get(resp, 'Body')).then((data) => {
        callback(null, data);
      }).catch((err) => {
        logger.error({ msg: 'S3__StorageService : getFileAsText error - Error 500', err: 'Failed to execute getFileAsText' });
        callback(err);
      });
    }).catch((error) => {
      if (_.get(error, '$metadata.httpStatusCode') == 404) {
        logger.error({ msg: 'S3__StorageService : getFileAsText client send error - Error with status code 404. File not found', error: error });
      } else {
        logger.error({ msg: 'S3__StorageService : getFileAsText client send error - Error 500. Failed to display blob', error: error });
      }
      callback(error);
    });
  }

  blockStreamUpload(uploadContainer = undefined) {
    return (req, res) => {
      try {
        const bucketName = uploadContainer;
        const blobFolderName = new Date().toLocaleDateString();
        let form = new multiparty.Form();
        form.on('part', async (part) => {
          if (part.filename) {
            let size = part.byteCount - part.byteOffset;
            let name = `${_.get(req, 'query.deviceId')}_${Date.now()}.${_.get(part, 'filename')}`;
            logger.info({
              msg: 'S3__StorageService : blockStreamUpload Uploading file to bucket ' +
                uploadContainer + ' to folder ' + blobFolderName +
                ' for file name ' + name + ' with size ' + size
            });
            let keyPath = uploadContainer + '/' + blobFolderName + '/' + name;
            logger.info({
              msg: 'S3__StorageService : blockStreamUpload Uploading file to ' + keyPath
            });
            try {
              const parallelUploads3 = new Upload({
                client: this.client,
                params: { Bucket: bucketName, Key: keyPath, Body: part },
                leavePartsOnError: false,
              });
              parallelUploads3.on("httpUploadProgress", (progress) => {
                let toStr;
                for (let key in progress) {
                  if (progress.hasOwnProperty(key)) {
                    toStr += `${key}: ${progress[key]}` + ", ";
                  }
                }
                logger.info({
                  msg: 'S3__StorageService : blockStreamUpload Uploading progress ' + toStr
                });
              });
              await parallelUploads3.done().then((data) => {
                const response = {
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
              }).catch((err) => {
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
                  msg: 'S3__StorageService : blockStreamUpload parallelUploads3 Failed to upload desktop crash logs to blob',
                  error: err
                });
                return res.status(500).send(this.apiResponse(response, 'api.desktop.upload.crash.log'));
              })
            } catch (e) {
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
                msg: 'S3__StorageService : blockStreamUpload try catch Failed to upload desktop crash logs to blob',
                error: e
              });
              return res.status(500).send(this.apiResponse(response, 'api.desktop.upload.crash.log'));
            }
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
          msg: 'S3__StorageService : blockStreamUpload Failed to upload desktop crash logs to blob',
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
    /**
   * @description                     - Uplaod file directly to s3 storage
   * @param {string} container        - S3 bucket name.
   * @param {string} filePath         - Path to the file in the bucket.
   * @param {Buffer} fileReadStream   - file data which needs to uploaded 
   * @returns {Promise<string>}       - A signed URL for the specified operation on the file.
   */
  async upload(container, fileName, file) {
    return new Promise((resolve, reject) => {
      let params = {
        Bucket: container,
        Key: fileName,
        Body: file,
      };
  
      this.client.upload(params, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data.Location);
        }
      });
    });
  }

  /**
   * @description                     - Generates a signed URL for performing specified operations on a file in the S3 bucket.
   * @param {string} container        - S3 bucket name.
   * @param {string} filePath         - Path to the file in the bucket.
   * @param {number} expiresIn        - Expiry time for the signed URL in seconds. Default is 3600.
   * @param {string} permission       - Permission for the operation. Use WRITE for PUT operations.
   * @returns {Promise<string>}       - A signed URL for the specified operation on the file.
   */
  async getSignedUrl(container, filePath, expiresIn = 3600, permission = '') {
    let presignedUrlOptions = { expiresIn: expiresIn }
    if ( permission === WRITE ) {
      presignedUrlOptions.operation = "putObject";
    }
    const command = this.getS3Command(container, filePath, undefined, permission);
    const presignedURL = await getSignedUrl(this.client, command, presignedUrlOptions);
    return Promise.resolve(presignedURL);
  }
  
  /**
   * @description                     - Generates a downloadable URL for a file in the S3 bucket.
   * @param {string} container        - S3 bucket name.
   * @param {string} filePath         - Path to the file in the bucket.
   * @param {number} expiresIn        - Optional. Number of seconds before the URL expires.
   * @returns {Promise<string>}       - A downloadable URL for the specified file.
   */
  async getDownloadableUrl(container, filePath, expiresIn = 3600) {
    let params = {
      Bucket: container,
      Key: filePath,
      Expires: expiresIn,
    };
    const requestedUrl = await this.client.getSignedUrl("getObject", params);
    const downloadableUrl = requestedUrl.toString().split('?')[0];
    return Promise.resolve(downloadableUrl);  
  }

  /**
   * @description                     - Generates a ingestion specification for a file.
   * @param {string} container        - Bucket name.
   * @param {string} filePath         - Path to the file in the bucket.
   * @returns {Promise<object>}       - A Promise that resolves to the Druid ingestion specification.
   */
  getFileUrlForIngestion(container, filePath) {
    let druidSpec = {
      "type": "s3",
      "uris": [`s3://${container}/${filePath}`]
    };
    return Promise.resolve(druidSpec);
  }
}
