# Sunbird
## client-cloud-services

[![NPM version](https://img.shields.io/npm/v/client-cloud-services.svg?flat&logo=npm)](https://img.shields.io/npm/v/client-cloud-services.svg?style=for-the-badge&logo=npm)

Sunbird client cloud service is multi-cloud npm toolkit that provides access across cloud services while giving you full control to use cloud-specific features. Plugin allows users to provision their infrastructure in any cloud provider.

<p>
  <img alt="javascript" src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" height=25 />
  <img alt="nodejs" src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" height=25 />
</p>

<!-- <img alt="sunbird-client-cloud-services" src="./docs/SB_ccs.png"> -->
![sunbird-client-cloud-services](/docs/SB_ccs.png)

---

## License

This project is licensed under the MIT License. See LICENSE for more information.

## Table of contents

- [Installation](#installation)
- [Usage](#usage)
- [Options](#options)
- [Releases](#releases)
---

### Installation


```
$ npm install --save client-cloud-services
```

### Usage

```
const cloudService  = require('client-cloud-services');

const config = {
  provider: CLOUD_PROVIDER,
  identity: CLOUD_IDENTITY,
  credential: CLOUD_IDENTITY_KEY,
  publicObjectStorage: PUBLIC_OBJECT_STORAGE
};

let client = cloudService.init(config);

client.SERVICE_NAME()...

```

### Options

1. Configuration for respective Cloud Providers

| Generalized keys |             Azure            |             AWS            |              GCP              |              OCI              | 
|:----------------:|:----------------------------:|:--------------------------:|:-----------------------------:|:-----------------------------:|
|     provider     |            `azure`           |            `aws`           |            `gcloud`           |            `oci`              |
|     identity     |      Azure Account Name      |       AWS Access Key       |        GCP Client Email       |        OCI S3 Access Key      |
|    credential    |       Azure Account Key      |       AWS Secret Key       |        GCP Private Key        |        OCI S3 Secret Key      |
|      region      |              --              |         AWS Region         |               --              |              OCI Region       |
|     projectId    |              --              |             --             |         GCP Project ID        |                --             |
|     endpoint     |              --              |             --             |               --              |        OCI S3 endpoint        |
| privateObjectStorage | Azure Reports Container Name | AWS Reports Bucket Name | GCloud Reports Bucket Name |   OCI Reports Bucket Name  |
|  publicObjectStorage |  Azure Labels Container Name |  AWS Labels Bucket Name |  GCloud Labels Bucket Name |   OCI Labels Bucket Name   |

### Releases

[Release Notes](/RELEASE.md)
