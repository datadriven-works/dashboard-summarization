# Looker Dashboard Summarization

This is an extension or plugin for Looker that integrates LLM's hosted on Vertex AI into a streaming dashboard summarization experience powered by Websockets.

![explore assistant](https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbzRrZ200dnB3YWg1Y3AwazVjdm44ZWx3dWZjZ2NtcGVieWZuY3VmNiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/kIXodRHInpIds8KPvC/giphy.gif)

## Description

The Dashboard Summarization extension can be broken down into 3 parts:

1.  **Summarization**
    - Generates concise summaries on your dashboard's data
2.  **Prescription**
    - Grounded in your dashboard's data, it can prescribe operational actions and point out outliers
3.  **Action**
    - Leveraging Looker's API, insights can be exported into the business tools your organization uses

Additionally, the extension provides:

- Google Chat Export (_Oauth integration to export the summary to Google Chat_)
- Slack Export (_Oauth integration to export the summary to Slack in rich text_)

Upcoming capabilities on the roadmap:

- Next Steps to Visualization
- Google Slides Integration
- Regenerate and Refine (_regenerate summary with custom input prompt_)

### Technologies Used

#### Frontend

- [React](https://reactjs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [Webpack](https://webpack.js.org/)

#### Looker

- [Looker Extension SDK](https://github.com/looker-open-source/sdk-codegen/tree/main/packages/extension-sdk-react)
- [Looker Query API](https://developers.looker.com/api/explorer/4.0/methods/Query)

#### Backend API

- [Google Cloud Platform](https://cloud.google.com/)
- [Vertex AI](https://cloud.google.com/vertex-ai)
- [Cloud Run](https://cloud.google.com/run?hl=en)
- [Websockets](https://socket.io)

#### Export API's

- [Slack](https://api.slack.com/authentication/oauth-v2)
- [GChat](https://developers.google.com/chat/api/guides/auth/users)

---

## Setup

![simple-architecture](./src/assets/dashboard-summarization-architecture.png)

### 1. Generative AI & Websocket Server

This section describes how to set up the web server on Cloud Run powering the Generative AI and Websocket integrations

#### Getting Started for Local Development

1. Clone or download a copy of this repository to your development machine.

   ```bash
   # cd ~/ Optional. your user directory is usually a good place to git clone to.
   git clone https://github.com/looker-open-source/dashboard-summarization.git
   ```

2. Navigate (`cd`) to the template directory on your system

   ```bash
   cd dashboard-summarization/websocket-service/src
   ```

3. Install the dependencies with [NPM](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm).

   ```bash
   npm install
   ```

   > You may need to update your Node version or use a [Node version manager](https://github.com/nvm-sh/nvm) to change your Node version.

4. Update `looker-example.ini` to `looker.ini` and replace environment variables Admin API Credentials. **IMPORTANT** use a section header that matches the host of your Looker instance. Example below:

Ex: Looker instance -> https://mycompany.cloud.looker.com

```
[mycompany]
base_url=<Your Looker instance URL>
client_id=<From your looker user's api credentials>
client_secret=<From your looker user's api credentials>
verify_ssl=true
```

This is configured to support deployment to multiple Looker instances reusing the same backend.

5. Start the development server

   ```bash
   npm run start
   ```

   Your development server should be running at http://localhost:5001

#### Deployment

1. For deployment you will need to build the docker file and submit it to the [Artifact Registry](https://cloud.google.com/artifact-registry). You need to first create a repository. Update `location` to your deployment region, then run this command from root

   ```bash
   gcloud artifacts repositories create dashboard-summarization-docker-repo  --repository-format=docker  --location=REGION
   ```

2. Navigate to template directory

   ```bash
   cd dashboard-summarization/websocket-service/src
   ```

3. Update `looker-example.ini` to `looker.ini` and replace environment variables Admin API Credentials. **IMPORTANT** use a section header that matches the host of your Looker instance. Example below:

Ex: Looker instance -> https://mycompany.cloud.looker.com

```
[mycompany]
base_url=<Your Looker instance URL>
client_id=<From your looker user's api credentials>
client_secret=<From your looker user's api credentials>
verify_ssl=true
```

This is configured to support deployment to multiple Looker instances reusing the same backend.

4. Update cloudbuild.yaml

   ```
   <YOUR_REGION> = Your deployment region
   <YOUR_PROJECT_ID> = Your GCP project ID
   ```

5. Build Docker File and Submit to Artifact Registry, replacing the `REGION` variable with your deployment region.
   _Skip this step if you already have a deployed image._ Please see the [official docs](https://cloud.google.com/build/docs/configuring-builds/create-basic-configuration) for creating the yaml file.
   `bash
	gcloud auth login && gcloud auth application-default login && gcloud builds submit --region=REGION --config cloudbuild.yaml
	`
   Save the returned docker image url. You can also get the docker image url from the Artifact Registry

6. Navigate (`cd`) to the terraform directory on your system
   ```bash
   cd .. && cd terraform
   ```
7. Replace defaults in the `variables.tf` file for project, region, docker url and service name.

   ```
   project_id=<GCP project ID>
   deployment_region=<Your deployement region>
   docker_image=<The docker image url from step 5>
   ```

8. Deploy resources. [_Ensure Application Default Credentials for GCP for Exported in your Environment first._](https://cloud.google.com/docs/authentication/provide-credentials-adc#google-idp)

   ```terraform
   terraform init

   terraform plan

   terraform apply
   ```

9. Save Deployed Cloud Run URL Endpoint

#### Optional: Setup Log Sink to BQ for LLM Cost Estimation and Request Logging

This extension will make a call to Vertex for each query in the dashboard and one final call to format all the summaries. Each request is logged with billable characters that can be used to
estimate and monitor costs. Please see [Google Cloud's docs](https://cloud.google.com/logging/docs/export/configure_export_v2#creating_sink) on setting up a log sink to BQ, using the below filter for Dashboard Summarization Logs (_change location and service name if those variables have been updated_):

```
resource.type = "cloud_run_revision"
resource.labels.service_name = "websocket-service"
resource.labels.location = "us-central1"
 severity>=DEFAULT
jsonPayload.component="dashboard-summarization-logs"
```

### 2. Looker Extension Framework Setup

#### Getting Started for Local Development

1. Clone or download a copy of this repository to your development machine (if you haven't already).

   ```bash
   # cd ~/ Optional. your user directory is usually a good place to git clone to.
   git clone https://github.com/looker-open-source/dashboard-summarization.git
   ```

2. Navigate (`cd`) to the root directory in the cloned repo

3. Ensure All the Appropriate Environment Variables are set. Copy .env.example file and save as .env
   _See Export Integration Steps below for Slack and Gchat Variables. These are optional, except WEBSOCKET_SERVICE_

```
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
CHANNEL_ID=
SPACE_ID=
WEBSOCKET_SERVICE=<Required: Cloud run endpoint url>
```

4.  Install the dependencies with [NPM](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm).

    ```bash
    npm install
    ```

    > You may need to update your Node version or use a [Node version manager](https://github.com/nvm-sh/nvm) to change your Node version.
    > If you get errors installing dependencies, you may try

    ```bash
    npm install --legacy-peer-deps
    ```

5.  Start the development server

    ```bash
    npm run develop
    ```

    Great! Your extension is now running and serving the JavaScript at http://localhost:8080/bundle.js.

6.  Now log in to Looker and create a new project.

    This is found under **Develop** => **Manage LookML Projects** => **New LookML Project**.

    You'll want to select "Blank Project" as your "Starting Point". You'll now have a new project with no files.

    1. In your copy of the extension project you have a `manifest.lkml` file.

    You can either drag & upload this file into your Looker project, or create a `manifest.lkml` with the same content. Change the `id`, `label`, or `url` as needed.

    project_name: "dashboard-summarization-extension"

         application: dashboard-summarization {
           label: "Dashboard Insights Powered by Vertex AI"
           # file: "bundle.js"
           url: "http://localhost:8080/bundle.js"
           mount_points: {
             dashboard_vis: yes
             dashboard_tile: yes
             standalone: yes
           }
           entitlements: {
             local_storage: yes
             use_form_submit: yes
             core_api_methods: ["run_inline_query","all_lookml_models","dashboard","dashboard_dashboard_elements"]
             external_api_urls: [
            "YOUR CLOUD RUN URL","http://localhost:5001","http://localhost:3000","https://*.googleapis.com","https://slack.com/api/*","https://slack.com/*"
           ]
             oauth2_urls: [
               "https://accounts.google.com/o/oauth2/v2/auth",
               "https://www.googleapis.com/auth/chat.spaces",
               "https://www.googleapis.com/auth/drive.metadata.readonly",
               "https://www.googleapis.com/auth/spreadsheets.readonly",
               "https://www.googleapis.com/auth/userinfo.profile",
               "https://www.googleapis.com/auth/chat.spaces.readonly",
               "https://www.googleapis.com/auth/chat.bot",
               "https://www.googleapis.com/auth/chat.messages",
               "https://www.googleapis.com/auth/chat.messages.create",
               "https://slack.com/oauth/v2/authorize"
             ]
           }
         }

7.  Create a `model` LookML file in your project. The name doesn't matter. The model and connection won't be used, and in the future this step may be eliminated.

    - Add a connection in this model. It can be any connection, it doesn't matter which.
    - [Configure the model you created](https://docs.looker.com/data-modeling/getting-started/create-projects#configuring_a_model) so that it has access to some connection.

8.  Connect your new project to Git. You can do this multiple ways:

    - Create a new repository on GitHub or a similar service, and follow the instructions to [connect your project to Git](https://docs.looker.com/data-modeling/getting-started/setting-up-git-connection)
    - A simpler but less powerful approach is to set up git with the "Bare" repository option which does not require connecting to an external Git Service.

9.  Commit your changes and deploy your them to production through the Project UI.

10. Reload the page and click the `Browse` dropdown menu. You should see your extension in the list.

- The extension will load the JavaScript from the `url` provided in the `application` definition. By default, this is https://localhost:8080/bundle.js. If you change the port your server runs on in the package.json, you will need to also update it in the manifest.lkml.

- Refreshing the extension page will bring in any new code changes from the extension template, although some changes will hot reload.

#### Deployment

The process above requires your local development server to be running to load the extension code. To allow other people to use the extension, a production build of the extension needs to be run. As the kitchensink uses code splitting to reduce the size of the initially loaded bundle, multiple JavaScript files are generated.

1. In your extension project directory on your development machine, build the extension by running the command `npm run build`.
2. Drag and drop the generated JavaScript file(bundle.js) contained in the `dist` directory into the Looker project interface.
3. Modify your `manifest.lkml` to use `file` instead of `url` and point it at the `bundle.js` file.

Note that the additional JavaScript files generated during the production build process do not have to be mentioned in the manifest. These files will be loaded dynamically by the extension as and when they are needed. Note that to utilize code splitting, the Looker server must be at version 7.21 or above.

### 3. [Optional] Export Integration Setup

#### Slack OAuth Setup

1. Create a Slack application

- Go to the [Slack App Creation Page](https://api.slack.com/apps)
- Click Create New App
- Choose from scratch option, enter a name and select the workspace you want to use.

2. Set Up OAuth Credentials

- Go to the **Oauth & Permissions** section
- In the Oauth Tokens section, you’ll find the `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET` add them to the `.env` file.
- Scroll down to Redirect URLs and add a redirect URL for authorization
  Ex: https://mycompany.cloud.looker.com/extensions/oauth2_redirect

3. Grant Permissions and install

- In **OAuth & Permissions**, scroll down to the Scopes section.
- Add the necessary permissions (scopes), such as `channels:read`, `channels:write`, `chat:write`, depending on your app’s needs.
- Once configured, click Install app to Workspace on the same OAuth & Permissions page.
- Lastly, you need to invite the bot to the channel using `/invite @bot-name` in the specific channel where you want it to send messages.

> To note, the Slack integration hardcodes a specific channel id in the code. These can be modified or an additional API request made to provide a channel selector experience.

#### Google Chat OAuth Setup

1. Enable Google Chat API
   Go to **API & Services** => **Library** and enable the Google Chat API.

2. Configure OAuth Consent Screen
   Navigate to **API & Services** => **OAuth** consent screen and select the user type

3. Create OAuth Credentials

- Go to **API & Services** => **Credentials** and select “Create credentials” with the OAuth client ID option.
- Add the Redirect URL to handle redirections after authentication. Ex: https://mycompany.cloud.looker.com/extensions/oauth2_redirect
- Acquire a Client ID from the OAuth app created and add it to the `GOOGLE_CLIENT_ID` `.env` file.

4. Create a Google Chat Bot
   Para crear el bot de Google Chat, asegúrate de que estás utilizando el mismo proyecto de Google Cloud Platform (GCP) que el configurado con Terraform para el despliegue.

In **Google Chat API** => **Manage** => **Configuration**, configure a bot used solely for message sending and ownership (_this bot is only used for message ownership and not used to call the Google Chat API_)

5. Add the Bot to Google Chat Spaces

- Manually add the bot to the relevant Google Chat space using the command `/addUser @bot-name` in the specific space where you want it to send messages.
- Add the specific Space ID to the `.env` file as `SPACE_ID`.

> To note, the Google Chat Integration hardcodes a specific space id in the code. These can be modified or an additional API request made to provide a space selector experience.

---

### Recommendations for fine tuning the model

This app uses a one shot prompt technique for fine tuning the LLM, meaning that all the metadata for the dashboard and request is contained in the prompt. To improve the accuracy, detail, and depth of the summaries and prescriptive steps returned by the LLM please pass as much context about the dashboard and the general recommendation themes in the prompt sent to the model. This can all be done through Looker as opposed to hard coded in the Cloud Run Service. Details below:

- Add dashboard details to each dashboard the extension is added to. This is used to inform the LLM of the general context of the report (see [these docs](https://cloud.google.com/looker/docs/editing-user-defined-dashboards#editing_dashboard_details) for more detail).
- Add notes to each tile on a dashboard. This is used to inform the LLM of the general context of each individual query on the dashboard. Use this to add small contextual notes the LLM should consider when generating the summary (see [these docs](https://cloud.google.com/looker/docs/editing-user-defined-dashboards#:~:text=Adding%20a%20tile%20note,use%20plain%20text%20or%20HTML.) for more details on adding tile notes).
