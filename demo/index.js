const cloudService = require('client-cloud-services');
const { cloudConfig, uploadContainerName } = require('./env');
const dateFormat = require('dateformat');
const uuidv1 = require('uuid/v1');
const express = require('express');
const app = express()

let cloudClient = cloudService.init(cloudConfig);
console.log("Cloud Client Initialised for The Provider:", cloudConfig.provider)

const getGeneralisedResourcesBundles = (req, res) => {
  let container, blobName = req.params.fileName;
  container = cloudConfig.publicObjectStorage;
  cloudClient.getFileAsText(container, blobName, function (error, result, response) {
    if (error && error.statusCode === 404) {
      console.error({ msg: "Blob %s wasn't found container %s", blobName, container })
      const response = {
        responseCode: "CLIENT_ERROR",
        params: {
          err: "CLIENT_ERROR",
          status: "failed",
          errmsg: "Blob not found"
        },
        result: error
      }
      res.status(404).send(apiResponse(response));
    } else {
      const response = {
        responseCode: "OK",
        params: {
          err: null,
          status: "success",
          errmsg: null
        },
        result: result
      }
      res.setHeader("Content-Type", "application/json");
      res.status(200).send(apiResponse(response));
    }
  });
}

const apiResponse = ({ responseCode, result, params: { err, errmsg, status } }) => {
  return {
    'id': 'api.report',
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

app.post('/upload',
  cloudClient.blockStreamUpload(uploadContainerName)
);

app.get('/fileread/:slug/:filename',
  cloudClient.fileReadStream(cloudConfig.privateObjectStorage));

app.get('/metadata',
  cloudClient.getFileProperties(cloudConfig.privateObjectStorage)
);

app.get('/getfileastext/:lang/:fileName',
  getGeneralisedResourcesBundles
);

app.listen(3030, () => {
  console.log(`Server is running on port 3030`);
});

