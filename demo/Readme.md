# Client-cloud-services-demo

### Setup

1. In `env.js` file provide the required configuration for respective Cloud Provider

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

---

### Usage
1. In demo directory run the following command in terminal
    ```
    yarn install
    ```
    This will install the required dependencies

2. Next run
    ```
    node index.js
    ```
    This will start the server

2. Run Curl commands provided below in Postman to get the response

---
### Client-cloud-services provides the following methods out of the box
#### Use respective curl commands for each method
1. `fileReadStream` - To read the file in case of JSON file and to get downloadable signedURL of the file in case of other type of files

```
curl --location 'http://localhost:3030/fileread/<folder>/<blob>'
```
where
- folder: folder in which blob exist
- blob : file name

---

2. `getFileProperties` - To get the properties of the file 
```
curl --location --globoff 'http://localhost:3030/metadata?fileNames={"file":"<folder>/<blob>"}'
```
where
- folder: folder in which blob exist
- blob : file name
---

3. `getFileAsText` - To get the file as a text stream
```
curl --location 'http://localhost:3030/getfileastext/<lang>/<blob>'
```
where
- lang: language
- blob : file name
---

4. `blockStreamUpload` - To upload the multipart form data to cloud

```
curl --location 'http://localhost:3030/upload?deviceId=<id> \
--form '=@"<filepath>"'
```
where
- id: Device Id
- filepath : Path of file to be uploaded
---

