//   ___                  ___     _    _       
//  |   \ ___ _ __  ___  | _ )_ _(_)__| |__ ___
//  | |) / _ \ '  \/ _ \ | _ \ '_| / _| / /(_-<
//  |___/\___/_|_|_\___/ |___/_| |_\__|_\_\/__/
//
// Visit https://developer.domo.com/portal/ec60c4980e1b5-getting-started-using-domo-bricks
// for tips on getting started, linking to Domo data and debugging your app

//Available globals
var domo = window.domo; // For more on domo.js: https://developer.domo.com/docs/dev-studio-guides/domo-js#domo.get
var datasets = window.datasets;

var itemsPerPageOptions = [10, 25, 50, 100];
var paginationSize = 10;
var explanationWriteSpeed = 8; // the lower the faster, 0 is no delay

var selectedDataSet = datasets[0];
var sampleQuestions = [
    {
        question: "Show the first three rows",
        sql: `SELECT * FROM ${selectedDataSet} LIMIT 3`,
        explanation: `The SQL statement "SELECT * FROM ${selectedDataSet} LIMIT 3" is used to retrieve data from a table called "${selectedDataSet}" and limit the result to only the first 3 rows.\n\nExplanation:\n- "SELECT *" means that we want to select all columns from the table.\n- "FROM ${selectedDataSet}" specifies the table we want to retrieve data from, which is "${selectedDataSet}".\n- "LIMIT 3" limits the result to only the first 3 rows.\n\nErrors in the SQL query:\nThere are no apparent errors in the SQL query provided. However, it's worth noting that the query assumes the table "${selectedDataSet}" exists in the database. If the table name is incorrect or doesn't exist, an error will occur.`,
    }
];


var questionForm = document.getElementById("questionForm");
var questionInput = document.getElementById("questionInput");
var dataTable = document.getElementById("dataTable");
// var submitSqlButton = document.getElementById('submitButton');
var explanationBlock = document.getElementById("explanationBlock");
var explainSqlButton = document.getElementById("explainSqlButton");
var explanationEl = document.getElementById("sqlExplanation");

// Setup SQL Editor
var editor = ace.edit("sqlStatement", {
    mode: "ace/mode/sql",
    selectionStyle: false,
    theme: "ace/theme/github",
    showPrintMargin: false,
});

// Setup events
editor.on('change', clearExplanation);
questionForm.addEventListener('submit', handleQuestionSubmit);
explainSqlButton.addEventListener('click', handleExplainButtonClick);
// submitSqlButton.addEventListener('click', handleSqlButtonClick);

// Get the data
var table, dataSourceSchema;
Promise.all([
    getDataSetSchema(selectedDataSet),
    loadQuestion(selectedDataSet, 0),
])
    .then(handleResult);


function handleResult(result) {
    dataSourceSchema = result[0];
    var data = result[1];

    updateTable(data);
    extract(data.rows, data.columns)
}

function loadQuestion(dataset, questionIndex) {
    var sampleQuestion = sampleQuestions[questionIndex];
    questionInput.value = sampleQuestion.question;
    editor.setValue(sampleQuestion.sql);
    editor.clearSelection();
    if (sampleQuestion.explanation) {
        setExplanation(sampleQuestion.explanation);
    }

    return domo.post(`/sql/v1/${dataset}`, sampleQuestion.sql, { contentType: 'text/plain' });
}

async function getDataSetSchema(dataSetAlias) {
    var getRowQuery = `SELECT * from ${makeSafeText(dataSetAlias)} limit 1`; // the sql endpoint includes schema information we can use
    try {
        var singleRow = await domo.post(`/sql/v1/${makeSafeText(dataSetAlias)}`, getRowQuery, { contentType: 'text/plain' })

        var dataSetSchemaColumns = singleRow.columns.map((column, index) => ({
            name: column,
            type: singleRow.metadata[index].type
        }));

        return {
            dataSourceName: dataSetAlias,
            description: "",
            columns: dataSetSchemaColumns
        };
    }
    catch (err) {
        err.message = "Error: Unable to load DataSet Schema."
        handleError(err);
        return {};
    }
}

function submitSQLQueryToDomo(sqlQuery) {
    return domo.post(`/sql/v1/${datasets[0]}`, makeSafeText(sqlQuery), { contentType: 'text/plain' });
}

function getTableData(data) {
    extract(data.rows, data.columns)
    return data.rows.map(row => {
        var obj = {};
        data.columns.forEach((column, index) => {
            obj[makeSafeText(column)] = makeSafeText(row[index]);
        });
        return obj;
    });
}

function updateTable(data) {
    if (table != null) {
        table.destroy();
    }
    extract(data.rows, data.columns)
    var options = {
        data: getTableData(data),
        layout: "fitDataFill",
        autoColumns: true,
    }
    var showPagination = data && data.rows && data.rows.length > paginationSize;
    if (showPagination) {
        Object.assign(options, {
            pagination: "local",
            paginationSize: paginationSize,
            paginationSizeSelector: itemsPerPageOptions,
            paginationCounter: "rows",
        });
    }
    table = new Tabulator(dataTable, options);
}

function toggleButtonSpinner(el, flag) {
    if (flag === false || Array.from(el.classList).indexOf('loading') >= 0) {
        el.classList.remove('loading');
        if (el.dataset.prev) {
            el.innerHTML = el.dataset.prev;
        }
    }
    else {
        el.classList.add('loading');
        el.dataset.prev = el.innerHTML;
        el.innerHTML =
            `<div class="spinner-border" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>`;
    }
}

async function handleQuestionSubmit(event) {
    // Prevent the form from being submitted normally
    event.preventDefault();
columnChart()
    // Get the value of the question input field
    var question = questionInput.value;

    // Disable the submit button during loading
    var submitButton = document.getElementById('generateSQLButton');
    submitButton.disabled = true;
    var prevLabel = submitButton.innerText;
    submitButton.innerText = 'Generating SQL...';

    try {
        await handleFormSubmission(question, editor);
        submitButton.disabled = false;
        submitButton.innerText = prevLabel;
    }
    catch (err) {
        submitButton.disabled = false;
        submitButton.innerText = prevLabel;
        err.message = "SQL generation failed. Please try again or adjust your question.";
        handleError(err);
    }

    var sqlStatement = editor.getValue();
    dataTable.classList.add('loading');

    try {
        var refreshedData = await submitSQLQueryToDomo(sqlStatement, selectedDataSet);
        dataTable.classList.remove('loading');
        updateTable(refreshedData);
    }
    catch (err) {
        dataTable.classList.remove('loading');
        err.message = "SQL Query failed. Check that your query doesn't have any typos or try the 'Explain SQL' button to try and diagnose the issue.";
        handleError(err);
    }
}

function clearExplanation() {
    explanationEl.innerText = "";
    explanationBlock.classList.add('empty');
}
function setExplanation(text) {
    explanationBlock.classList.remove('empty');
    explanationEl.innerText = "";
    typeText(explanationEl, text);
}

async function handleExplainButtonClick(event) {
    explainSqlButton.disabled = true;
    setExplanation('Getting Explanation...');
    toggleButtonSpinner(explainSqlButton, true);
    var sqlStatement = editor.getValue();

    try {
        var sqlExplanation = await explainSql(sqlStatement);
        explainSqlButton.disabled = false;
        toggleButtonSpinner(explainSqlButton, true);
        setExplanation(sqlExplanation);
    }
    catch (err) {
        explainSqlButton.disabled = false;
        toggleButtonSpinner(explainSqlButton, true);
        err.message = "SQL Explanation failed. Please try again or adjust your query.";
        handleError(err);
    }
}

// async function handleSqlButtonClick(event) {
//     submitSqlButton.disabled = true;
//     var sqlStatement = editor.getValue();
//     dataTable.classList.add('loading');
//     toggleButtonSpinner(submitSqlButton, true);

//     try {
//         var refreshedData = await submitSQLQueryToDomo(sqlStatement, selectedDataSet);
//         submitSqlButton.disabled = false;
//         dataTable.classList.remove('loading');
//         updateTable(refreshedData);
//         toggleButtonSpinner(submitSqlButton, false);
//     }
//     catch (err) {
//         submitSqlButton.disabled = false;
//         dataTable.classList.remove('loading');
//         toggleButtonSpinner(submitSqlButton, false);
//         err.message = "SQL Query failed. Check that your query doesn't have any typos or try the 'Explain SQL' button to try and diagnose the issue.";
//         handleError(err);
//     }
// }

async function handleFormSubmission(question, sqlEditor) {
    var sqlPrompt = await textToSql(question, dataSourceSchema);
    var sqlStatement = sqlPrompt.choices[0].output;

    // Display the SQL statement in the code editor
    sqlEditor.setValue(sqlStatement);

    return sqlStatement;
}

function textToSql(text, dataSourceSchema) {
    var payload = {
        input: text,
        dataSourceSchemas: [dataSourceSchema]
    };
    return domo.post("domo/ai/v1/text/sql", payload);
}

async function explainSql(sql) {
    var prompt = `Please (ELI5) the following sql statement to me: ${sql}. Please be as concise as possible and explain any errors that you find in the SQL query.`;
    var endpoint = {
        url: "generation",
        body: {
            "input": prompt
        }
    };

    var sqlExplanation = await domo.post('/domo/ai/v1/text/' + endpoint.url, endpoint.body);
    return sqlExplanation.choices[0] && sqlExplanation.choices[0].output;
}

function typeText(element, text, index = 0) {
    var typeTextRecursive = function (element, text, index = 0) {
        if (index < text.length) {
            element.innerHTML = element.textContent + text.charAt(index);
            setTimeout(() => typeText(element, text, index + 1), explanationWriteSpeed);
        }
    }
    if (explanationWriteSpeed > 0) {
        typeTextRecursive(element, makeSafeText(text), index);
    }
    else {
        element.innerHTML = makeSafeText(text);
    }
}


// Error Handling Functions
function handleError(error) {
    var message = error && error.message;
    if (message && typeof message === 'string') {
        if (message.toLowerCase() === 'forbidden') {
            message = "Please contact ai@domo.com to request this feature be enabled in your instance."
        }
        else if (message.toLowerCase() === 'bad request') {
            message = "Bad request. Please check the code submitting the request to ensure it looks correct and try again."
        }
    }
    else { // If there is no message, assume the ai endpoint is disabled
        message = "Please contact ai@domo.com to request this feature be enabled in your instance."
    }
    appendAlert(message);
    console && console.warn && console.warn('Error: ' + message);
}

function appendAlert(message, hideIcon = true) {
    var svg = hideIcon
        ? ''
        : '<svg class="bi flex-shrink-0 me-2" width="24" height="24" role="img" aria-label="Danger:"><use xlink:href="#exclamation-triangle"/></svg>';
    var alert = `
    <div class="alert alert-warning alert-dismissible fade show" role="alert">
      ${svg}
      <span>
        ${makeSafeText(message)}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </span>
    </div>`;

    var alertMessage = document.getElementById("alert-message");
    alertMessage.innerHTML = alert;
}


// Create a safe version of an input value to be stored to the database
// Transforms: "<h1>test</h1>"  =>  "&lt;h1&gt;test&lt;/h1&gt;"
function makeSafeText(text) {
    return String(text)
        .replace(/&[/s]+/g, '&amp; ')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Decode the text before displaying as an input value
// Example: "&lt;h1&gt;test&lt;/h1&gt;"  =>  "<h1>test</h1>"
function decodeSafeText(text) {
    var div = document.createElement('div');
    div.innerHTML = makeSafeText(text);
    return div.innerText;
}



function extract(data, column){

const mergedData = data.map((row) => {
              const rowData = {};
              column.forEach((key, index) => {
                  rowData[key] = row[index];
              });
              return rowData;
          });

    columnChart(column, mergedData)
}
    
function columnChart(column, datas){
    const ques = questionInput.value.split(" ")
   
    const pie_mat = ['pie chart', 'pie', 'bar', 'bar chart', 'lines', 'line', 'line chart', 'lines chart', 'months', 'month', 'year', 'years', 'date', 'dates', 'today', 'yesterday', 'day', 'days', 'week', 'weeks'];
    var chartAi = ques.filter(value => pie_mat.includes(value));

        document.getElementById('chartapex').style.display = "none";
        document.getElementById('piechartapex').style.display = "none";
        document.getElementById('linechart').style.display = "none";

    if(chartAi[0] === 'pie' || chartAi[0] === 'pie chart'){

        document.getElementById('chartapex').style.display = "none";
        document.getElementById('linechart').style.display = "none";
        document.getElementById('piechartapex').style.display = "block";
                var pieoptions = {
                    series: datas ? datas?.map((val) => Number(val[column[1]])) : ['0'],
                    chart: {
                        width: 380,
                        type: 'pie',
                    },
                    legend: {
                        show: false,
                    },

                    labels: datas ? datas?.map((val) => val[column[0]]) : [''],
                };

                var piechart = new ApexCharts(document.querySelector("#piechartapex"), pieoptions);
                piechart.render();
                piechart.resetSeries()
          piechart.updateOptions(pieoptions,true, true, true);


    }else if (chartAi[0] === 'bar' || chartAi[0] === 'bar chart'){

         document.getElementById('chartapex').style.display = "block";
        document.getElementById('piechartapex').style.display = "none";
        document.getElementById('linechart').style.display = "none";
var options = {
              series: [{
                  name: '',
                  data: datas ? datas?.map((val) => val[column[1]]) : ['0']
              }],
              chart: {
                  type: 'bar',
                  height: 350
              },
              plotOptions: {
                  bar: {
                      horizontal: false,
                      columnWidth: '55%',
                      endingShape: 'rounded'
                  },
              },
              dataLabels: {
                  enabled: false
              },
              stroke: {
                  show: true,
                  width: 2,
                  colors: ['transparent']
              },
              xaxis: {
                  categories: datas ? datas?.map((val) => val[column[0]]) : [''],
              },
              yaxis: {
                  labels: {
                    formatter: function (value) {
                        // You can customize the formatting of the y-axis labels here
                        return numDifferentiation(value); // For example, rounding to zero decimal places
                    }
                 },
              },
              fill: {
                  opacity: 1
              },
          };

          var chart = new ApexCharts(document.querySelector("#chartapex"), options);
          chart.render();
          chart.resetSeries([])
          chart.updateOptions(options, true, true, true);
    }else if (chartAi[0] === 'line' || chartAi[0] === 'lines' || chartAi[0] === 'line chart' || chartAi[0] === 'lines chart' || chartAi[0] === 'year' || chartAi[0] === 'years' || chartAi[0] === 'month' || chartAi[0] === 'months' || chartAi[0] === 'day' || chartAi[0] === 'days' || chartAi[0] === 'today' || chartAi[0] === 'yesterday' || chartAi[0] === 'week' || chartAi[0] === 'weeks'){


        document.getElementById('chartapex').style.display = "none";
        document.getElementById('piechartapex').style.display = "none";
        document.getElementById('linechart').style.display = "block";

                  var lineoptions = {
                                series: [{
                                    name: "",
                                    data: datas ? datas?.map((val) => val[column[1]]) : ['0']
                                }],
                                chart: {
                                    height: 350,
                                    type: 'line',
                                },
                                dataLabels: {
                                    enabled: false
                                },
                                stroke: {
                                    curve: 'smooth'
                                },
                                grid: {
                                    row: {
                                        colors: ['#f3f3f3', 'transparent'], // takes an array which will be repeated on columns
                                        opacity: 0.5
                                    },
                                },
                                xaxis: {
                                    categories: datas ? datas?.map((val) => val[column[0]]) : [''],
                                },
                                yaxis: {
                                    labels: {
                                        formatter: function (value) {
                                            // You can customize the formatting of the y-axis labels here
                                            return numDifferentiation(value); // For example, rounding to zero decimal places
                                        }
                                    },
                                },
                            };

                            var linecharts = new ApexCharts(document.querySelector("#linechart"), lineoptions);
                            linecharts.render();
                            linecharts.updateOptions(lineoptions, true, true, true);
    }

    //     const objectNames = [];

    //     datas.forEach(obj => {
    //           const keys = Object.keys(obj);
    //           keys.forEach(key => {
    //               if (!objectNames.includes(key)) {
    //                   objectNames.push(key);
    //               }
    //           });
    //       });

    // console.log(objectNames)

        
      }


      function numDifferentiation(val) {
            let name = '';
            if (val >= 10000000) {
                val = (val / 10000000).toFixed(1) + 'Cr';
            } else if (val >= 100000) {
                val = (val / 100000).toFixed(1) + ' Lac'
            }
            return val
        }
